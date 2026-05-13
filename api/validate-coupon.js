const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.log };

const _rlMap = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const entry = _rlMap.get(key);
  if (!entry || now > entry.resetAt) {
    _rlMap.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true };
  }
  if (entry.count >= 30) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

module.exports = async (req, res) => {
  // ═══════════════════════════════════════════════════════════
  // CORS HEADERS
  // ═══════════════════════════════════════════════════════════
  const allowedOrigins = [
    'https://electricink.ie',
    'https://www.electricink.ie'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATE INPUT
  // ═══════════════════════════════════════════════════════════
  const rawIp = req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null)
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
  const ip = /^[\w.:[\]-]{3,45}$/.test(rawIp) ? rawIp : 'unknown';
  const rateKey = `coupon_${ip}`;
  try {
    const rl = await checkRateLimit(rateKey);
    if (!rl.allowed) {
      const retryAfter = rl.resetAt ? Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000) : 60;
      return res.status(429).json({ error: 'Too many requests', retryAfter });
    }
  } catch (e) {
    logger.error('Rate limit check failed, allowing request', e);
  }
  try {
    const { code, email, subtotal } = req.body;
    
    if (!code || !email || subtotal === undefined) {
      return res.status(400).json({ 
        valid: false, 
        message: 'Code, email and subtotal are required' 
      });
    }

    const upperCode = code.trim().toUpperCase();
    logger.info('[COUPON] Validating', { code: upperCode, email, subtotal });

    // ═══════════════════════════════════════════════════════════
    // VALIDATE STRIPE COUPON/PROMOTION CODE
    // ═══════════════════════════════════════════════════════════
    
    let coupon;
    let promoCodeId = null;
    
    try {
      // First try: Promotion Code lookup (e.g., BLACKCAT5)
      const promotions = await stripe.promotionCodes.list({ 
        code: upperCode,
        active: true,
        limit: 1 
      });
      
      if (promotions.data.length > 0) {
        const promoCode = promotions.data[0];
        coupon = promoCode.coupon;
        promoCodeId = promoCode.id;
        
        logger.info('[COUPON] Found promotion code', { promoCodeId });
        
        // Check expiration
        if (!coupon.valid || (coupon.redeem_by && Date.now() / 1000 > coupon.redeem_by)) {
          logger.warn('[COUPON] Expired', { code: upperCode });
          return res.json({ valid: false, message: 'Coupon expired' });
        }
        
        // Check max redemptions
        if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
          logger.warn('[COUPON] Max redemptions reached', { code: upperCode });
          return res.json({ valid: false, message: 'Coupon fully redeemed' });
        }
        // ═══════════════════════════════════════════════════════════════
        // CHECK CUSTOMER RESTRICTION (for pro team / specific customers)
        // ═══════════════════════════════════════════════════════════════
        if (promoCode && promoCode.metadata && promoCode.metadata.restricted_email) {
          const restrictedEmail = promoCode.metadata.restricted_email.toLowerCase().trim();
          const customerEmail = email.toLowerCase().trim();
          
          if (process.env.NODE_ENV === 'development') {
            logger.debug('[COUPON] Checking email restriction', { restrictedEmail, customerEmail });
          }
          
          if (customerEmail !== restrictedEmail) {
            logger.warn('[COUPON] Email restriction failed', { customerEmail });
            return res.json({ 
              valid: false, 
              message: 'This coupon is not available for your email' 
            });
          }
          
          if (process.env.NODE_ENV === 'development') {
            logger.debug('[COUPON] Email restriction passed', { customerEmail });
          }
        }
        
      } else {
        // Second try: Direct coupon lookup (e.g., promo_XXX)
        if (process.env.NODE_ENV === 'development') {
          logger.debug('[COUPON] Trying direct coupon lookup', { code: upperCode });
        }
        coupon = await stripe.coupons.retrieve(upperCode);
        
        if (!coupon || !coupon.valid) {
          logger.warn('[COUPON] Invalid coupon', { code: upperCode });
          return res.json({ valid: false, message: 'Invalid coupon' });
        }
      }
    } catch (err) {
      logger.warn('[COUPON] Not found', { code: upperCode, error: err.message });
      return res.json({ valid: false, message: 'Coupon not found' });
    }

    // ═══════════════════════════════════════════════════════════
    // CHECK FIRST ORDER (if coupon requires it)
    // ═══════════════════════════════════════════════════════════
    
    if (coupon.metadata && coupon.metadata.first_order_only === 'true') {
      try {
        const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
        const checkRes = await fetch(
          `${INTERNAL_URL}/api/sales/website/has-orders?email=${encodeURIComponent(email.toLowerCase())}`,
          {
            headers: { 'x-webhook-secret': process.env.INTERNAL_WEBHOOK_SECRET || '' },
            signal: AbortSignal.timeout(3000)
          }
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.has_orders) {
            logger.warn('[COUPON] Not first order', { email });
            return res.json({ valid: false, message: 'Coupon valid only for first order' });
          }
        }
      } catch (err) {
        logger.warn('[COUPON] First order check failed, allowing', { error: err && err.message });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CALCULATE DISCOUNT
    // ═══════════════════════════════════════════════════════════
    
    let discountAmount = 0;
    let discountType = '';
    let discountDisplay = '';
    
    if (coupon.percent_off) {
      discountAmount = subtotal * (coupon.percent_off / 100);
      discountType = 'percentage';
      discountDisplay = `${coupon.percent_off}% off`;
    } else if (coupon.amount_off) {
      discountAmount = coupon.amount_off / 100; // Stripe uses cents
      discountType = 'fixed';
      discountDisplay = `€${discountAmount.toFixed(2)} off`;
    }
    
    // Don't allow discount > subtotal
    discountAmount = Math.min(discountAmount, subtotal);
    
    logger.info('[COUPON] Valid', { code: upperCode, discount: discountAmount.toFixed(2), type: discountType });

    // ═══════════════════════════════════════════════════════════
    // RETURN SUCCESS
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      valid: true,
      coupon: {
        code: upperCode,
        id: coupon.id,
        promoCodeId: promoCodeId,
        type: discountType,
        percent_off: coupon.percent_off || null,
        amount_off: coupon.amount_off || null,
        name: coupon.name || upperCode
      },
      discount: Number(discountAmount.toFixed(2)),
      discountDisplay: discountDisplay,
      message: `Coupon applied: ${discountDisplay}`
    });

  } catch (error) {
    logger.error('[COUPON] Validation error', error);
    return res.status(500).json({ 
      valid: false, 
      message: 'Error validating coupon' 
    });
  }
};
