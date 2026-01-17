const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getFirestore } = require('./lib/firebase-admin');

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
  try {
    const { code, email, subtotal } = req.body;
    
    if (!code || !email || subtotal === undefined) {
      return res.status(400).json({ 
        valid: false, 
        message: 'Código, email e subtotal são obrigatórios' 
      });
    }

    const upperCode = code.trim().toUpperCase();
    console.log(`[COUPON] Validating: ${upperCode} for ${email}, subtotal: €${subtotal}`);

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
        
        console.log(`[COUPON] Found promotion code: ${promoCodeId}`);
        
        // Check expiration
        if (!coupon.valid || (coupon.redeem_by && Date.now() / 1000 > coupon.redeem_by)) {
          console.log(`[COUPON] Expired: ${upperCode}`);
          return res.json({ valid: false, message: 'Cupom expirado' });
        }
        
        // Check max redemptions
        if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
          console.log(`[COUPON] Max redemptions reached: ${upperCode}`);
          return res.json({ valid: false, message: 'Cupom esgotado' });
        }
        
      } else {
        // Second try: Direct coupon lookup (e.g., promo_XXX)
        console.log(`[COUPON] Trying direct coupon lookup: ${upperCode}`);
        coupon = await stripe.coupons.retrieve(upperCode);
        
        if (!coupon || !coupon.valid) {
          console.log(`[COUPON] Invalid coupon: ${upperCode}`);
          return res.json({ valid: false, message: 'Cupom inválido' });
        }
      }
    } catch (err) {
      console.log(`[COUPON] Not found: ${upperCode}`, err.message);
      return res.json({ valid: false, message: 'Cupom não encontrado' });
    }

    // ═══════════════════════════════════════════════════════════
    // CHECK FIRST ORDER (if coupon requires it)
    // ═══════════════════════════════════════════════════════════
    
    if (coupon.metadata && coupon.metadata.first_order_only === 'true') {
      console.log(`[COUPON] Checking first order for: ${email}`);
      
      const db = getFirestore();
      const ordersSnapshot = await db.collection('orders')
        .where('customerEmail', '==', email.toLowerCase())
        .where('status', '==', 'paid')
        .limit(1)
        .get();
      
      if (!ordersSnapshot.empty) {
        console.log(`[COUPON] Not first order for: ${email}`);
        return res.json({ 
          valid: false, 
          message: 'Cupom válido apenas para primeira compra' 
        });
      }
      
      console.log(`[COUPON] First order confirmed for: ${email}`);
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
    
    console.log(`[COUPON] Valid! Discount: €${discountAmount.toFixed(2)} (${discountType})`);

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
      message: `✅ Cupom aplicado: ${discountDisplay}`
    });

  } catch (error) {
    console.error('[COUPON] Validation error:', error);
    return res.status(500).json({ 
      valid: false, 
      message: 'Erro ao validar cupom' 
    });
  }
};
