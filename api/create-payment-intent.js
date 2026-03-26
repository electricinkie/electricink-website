// Validar Firestore em produção
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is required in production');
  }
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { captureException } = require('./lib/sentry');
const { z } = require('zod');
const logger = require('./lib/logger');

// Conditional debug logging helper
const debug = process.env.NODE_ENV === 'development' 
  ? (...args) => logger.debug(...args)
  : () => {};
const fs = require('fs');
const path = require('path');

// Runtime environment diagnostic (do NOT log full secrets)
logger.info('Environment check', {
  hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
  hasFirebaseAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
  hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET
});

// Load and merge all JSON product files from `data/` so the backend
// has a single `stripeProducts` object even if `stripe-products.json` is missing.
async function loadProducts() {
  const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
  const INTERNAL_KEY = process.env.CRM_SECRET || '';
  try {
    const res = await fetch(`${INTERNAL_URL}/api/products`, {
      headers: { 'x-crm-secret': INTERNAL_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`Internal API returned ${res.status}`);
    const rows = await res.json();

    // rows is an array of flat rows: { id, name, category, variant_id, label, price_ex, stock }
    // Build the same shape the rest of the file expects:
    // { [productId]: { basic: { price }, variants: [{ id, price, label }] } }
    const merged = {};
    for (const row of rows) {
      const pid = row.id;
      const priceGross = parseFloat((parseFloat(row.price_ex) * 1.23).toFixed(2));
      if (!merged[pid]) {
        merged[pid] = { basic: { price: priceGross }, variants: [] };
      }
      merged[pid].variants.push({
        id: row.variant_id,
        label: row.label,
        price: priceGross,
        stock: row.stock
      });
    }
    return merged;
  } catch (err) {
    logger.warn('Failed to fetch live prices from internal — falling back to local JSON', { error: err && err.message });

    // Fallback: local JSON files
    const dataDir = path.join(__dirname, '..', 'data');
    let merged = {};
    try {
      const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const obj = require(path.join('..', 'data', file));
          if (obj && typeof obj === 'object') merged = { ...merged, ...obj };
        } catch (e) {
          logger.warn('Failed to load data file', { file, error: e && e.message });
        }
      }
      for (const [id, product] of Object.entries(merged)) {
        if (!product || typeof product !== 'object') continue;
        if (!product.basic && typeof product.price === 'number') {
          merged[id].basic = { price: product.price };
        }
        if (!product.price && product.variants && product.variants[0]) {
          merged[id].price = product.variants[0].price;
          if (!merged[id].basic) merged[id].basic = { price: product.variants[0].price };
        }
      }
    } catch (e) {
      logger.warn('Data directory not found or unreadable', { error: e && e.message });
    }
    return merged;
  }
}

let stripeProducts = {};
const { getFirestore, admin } = require('./lib/firebase-admin');

// Delegate Firestore initialization to the shared module
function initFirestore() {
  return getFirestore();
}

/**
 * Simple Firestore-backed rate limiter per key (e.g., IP).
 * Limits to LIMIT requests per WINDOW_SECONDS window.
 */
async function checkRateLimit(key) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return { allowed: true };
  initFirestore();
  if (!admin.apps || !admin.apps.length) return { allowed: true };

  const db = admin.firestore();
  const LIMIT = 30; // requests
  const WINDOW_SECONDS = 60; // seconds
  const docRef = db.collection('rate_limits').doc(key);

  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      const now = Date.now();

      if (!doc.exists) {
        const resetAt = admin.firestore.Timestamp.fromMillis(now + WINDOW_SECONDS * 1000);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
        tx.set(docRef, { count: 1, resetAt, expiresAt });
        return { allowed: true, remaining: LIMIT - 1, resetAt: resetAt.toDate() };
      }

      const data = doc.data() || {};
      const resetAtMillis = (data.resetAt && typeof data.resetAt.toMillis === 'function') ? data.resetAt.toMillis() : (data.resetAt || 0);

      if (now > resetAtMillis) {
        const resetAt = admin.firestore.Timestamp.fromMillis(now + WINDOW_SECONDS * 1000);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
        tx.set(docRef, { count: 1, resetAt, expiresAt });
        return { allowed: true, remaining: LIMIT - 1, resetAt: resetAt.toDate() };
      }

      if ((data.count || 0) >= LIMIT) {
        return { allowed: false, remaining: 0, resetAt: new Date(resetAtMillis) };
      }

      tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
      return { allowed: true, remaining: LIMIT - ((data.count || 0) + 1), resetAt: new Date(resetAtMillis) };
    });

    return result;
  } catch (err) {
    logger.error('Rate limit transaction failed', err);
    // Fail closed in production for security, fail open in development for convenience
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    return { allowed: !isProduction };
  }
}

/**
 * Calculate shipping cost based on subtotal and address
 * @param {number} subtotal - Cart subtotal in EUR
 * @param {object} address - Shipping address with postalCode
 * @returns {number} Shipping cost in EUR
 */
function calculateShipping(subtotal, address = {}) {
  const FREE_SHIPPING_THRESHOLD = 120;
  const STANDARD_RATE = 11.50;
  const SAMEDAY_RATE = 7.50;
  const PICKUP_RATE = 0;

  // Free shipping above threshold
  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return 0;
  }
  // Store pickup is always free
  if (address.method === 'pickup') {
    return PICKUP_RATE;
  }

  // Same-day Dublin delivery (D01-D08)
  if (address.method === 'same-day' && address.postalCode) {
    const isDublinCentral = /^D0[1-8]/i.test(address.postalCode.trim());
    if (isDublinCentral) {
      return SAMEDAY_RATE;
    }
  }

  // Default to standard shipping
  return STANDARD_RATE;
}

/**
 * Validate and calculate cart total from items
 * @param {array} cartItems - Array of cart items from frontend
 * @returns {object} Calculated totals { subtotal, shipping, vat, total }
 */
// Resolve incoming item id to a product and optional variant id using heuristics.
function resolveProductById(itemId) {
  if (!itemId || typeof itemId !== 'string') return null;

  // Exact match first
  if (stripeProducts[itemId]) return { product: stripeProducts[itemId], variantId: null, matchedId: itemId };

  const tokens = itemId.split('-');

  // Detect duplicated prefix (e.g. "gloo-stencil-gloo-stencil-30ml" -> "gloo-stencil-30ml")
  for (let k = 1; k <= Math.floor(tokens.length / 2); k++) {
    let repeated = true;
    for (let i = 0; i < k; i++) {
      if (tokens[i] !== tokens[i + k]) {
        repeated = false;
        break;
      }
    }
    if (repeated) {
      const candidate = tokens.slice(k).join('-');
      // If candidate matches a top-level product key
      if (stripeProducts[candidate]) return { product: stripeProducts[candidate], variantId: null, matchedId: candidate, note: 'removed duplicated prefix' };
      // Otherwise check if candidate matches any variant id or variant.priceId
      for (const p of Object.values(stripeProducts)) {
        if (p.variants && Array.isArray(p.variants)) {
          for (const v of p.variants) {
            if (v.id === candidate || v.priceId === candidate || v.stripe_price_id === candidate) {
              return { product: p, variantId: v.id || v.priceId, matchedId: p.id, note: 'removed duplicated prefix -> matched variant' };
            }
          }
        }
      }
    }
  }

  // Search for variant id or price id across products
  for (const p of Object.values(stripeProducts)) {
    if (p.variants && Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (v.id === itemId || v.priceId === itemId || v.stripe_price_id === itemId) {
          return { product: p, variantId: v.id || v.priceId, matchedId: p.id };
        }
      }
    }
  }

  // Try suffix matching (last 1..3 tokens) against variant ids
  for (let i = 1; i <= Math.min(3, tokens.length - 1); i++) {
    const suffix = tokens.slice(tokens.length - i).join('-');
    for (const p of Object.values(stripeProducts)) {
      if (p.variants && p.variants.find(v => v.id === suffix)) {
        return { product: p, variantId: suffix, matchedId: p.id, note: 'matched by suffix' };
      }
    }
  }

  return null;
}

async function validateAndCalculateTotal(cartItems, shippingAddress = {}, couponCode = null, clientDiscount = 0, customerEmail = '') {
  if (!stripeProducts || Object.keys(stripeProducts).length === 0) {
    stripeProducts = await loadProducts();
  }
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Invalid cart: no items provided');
  }

  let subtotal = 0;

  // Calculate subtotal from backend prices (source of truth)
  for (const item of cartItems) {
    // Resolve product (accept a few malformed/variant id formats)
    const resolved = resolveProductById(item.id);

    if (!resolved || !resolved.product) {
      logger.error('Available products', Object.keys(stripeProducts));
      throw new Error(`Invalid product ID: ${item.id}`);
    }

    const product = resolved.product;

    if (resolved.matchedId && resolved.matchedId !== item.id) {
      logger.info('Mapped incoming item id', {
        from: item.id,
        to: resolved.matchedId,
        note: resolved.note || ''
      });
    }

    const quantity = parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      throw new Error(`Invalid quantity for ${item.id}: ${item.quantity}`);
    }

    // Determine price: prefer variant price when resolved, otherwise product.basic.price
    let price;
    if (resolved.variantId) {
      const variant = (product.variants || []).find(v => v.id === resolved.variantId || v.priceId === resolved.variantId || v.stripe_price_id === resolved.variantId);
      price = (variant && typeof variant.price === 'number') ? variant.price : (product.basic && typeof product.basic.price === 'number' ? product.basic.price : product.price);
    } else {
      price = (product.basic && typeof product.basic.price === 'number') ? product.basic.price : product.price;
    }

    if (typeof price !== 'number') {
      throw new Error(`Invalid product data for: ${item.id}`);
    }

    // Use BACKEND price (not frontend!)
    subtotal += price * quantity;
  }

  // Calculate shipping from backend
  const shipping = calculateShipping(subtotal, shippingAddress);

  // ═══════════════════════════════════════════════════════════════
  // VALIDATE AND APPLY DISCOUNT (server-side verification)
  // ═══════════════════════════════════════════════════════════════
  let discount = 0;

  if (couponCode && Number(clientDiscount) > 0) {
    try {
      // Try promotion code first
      const promotions = await stripe.promotionCodes.list({
        code: String(couponCode).toUpperCase(),
        active: true,
        limit: 1
      });

      let coupon = null;
      if (promotions && promotions.data && promotions.data.length > 0) {
        coupon = promotions.data[0].coupon;
      } else {
        try {
          coupon = await stripe.coupons.retrieve(couponCode);
        } catch (err) {
          // coupon not found
          coupon = null;
        }
      }

      if (coupon) {
        // Optional first-order check via coupon metadata
        const firstOrderOnly = coupon.metadata && coupon.metadata.first_order_only === 'true';
        if (firstOrderOnly && customerEmail) {
          try {
            initFirestore();
            const db = admin.firestore();
            const ordersSnap = await db.collection('orders')
              .where('customerEmail', '==', customerEmail)
              .where('status', '==', 'paid')
              .limit(1)
              .get();
            if (!ordersSnap.empty) {
              // Customer already has orders; ignore coupon
              discount = 0;
            }
          } catch (err) {
            // Firestore check failed; fail-safe: ignore first-order restriction and continue
            logger.warn('First-order check failed', err && err.message);
          }
        }

        // Calculate discount amount based on coupon
        if (!discount) {
          if (coupon.percent_off) {
            discount = subtotal * (coupon.percent_off / 100);
          } else if (coupon.amount_off) {
            discount = (coupon.amount_off || 0) / 100; // amount_off in cents
          }
          // Clamp
          discount = Math.min(Number(discount || 0), subtotal);
        }
      }
    } catch (err) {
      logger.warn('Coupon validation error', err && err.message);
      discount = 0;
    }
  }

  // Fallback: do not trust clientDiscount unless coupon validated; discount already calculated
  // Calculate VAT as informational only (prices include VAT)
  const subtotalAfterDiscount = subtotal - discount;
  const VAT_RATE = 0.23;
  // VAT portion (reverse-rate) calculated on subtotal after discount — do not add VAT on top
  const vat = subtotalAfterDiscount - (subtotalAfterDiscount / (1 + VAT_RATE));

  // Final total: subtotal after discount + shipping (VAT already included in product prices)
  const total = subtotalAfterDiscount + shipping;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shipping: parseFloat(shipping.toFixed(2)),
    discount: parseFloat((discount || 0).toFixed(2)),
    vat: parseFloat(vat.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

module.exports = async function handler(req, res) {
  // CORS headers
  const ALLOWED_ORIGINS = [
    'https://electricink.ie',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const origin = req.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  // Handle OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Zod schema de validação
  const shippingAddressSchema = z.object({
    line1:       z.string().max(200).optional(),
    line2:       z.string().max(200).optional(),
    city:        z.string().max(100).optional(),
    state:       z.string().max(100).optional(),
    postalCode:  z.string().max(20).optional(),
    country:     z.string().max(2).optional(),
    phone:       z.string().max(30).optional(),
    phoneNumber: z.string().max(30).optional(),
    firstName:   z.string().max(100).optional(),
    lastName:    z.string().max(100).optional(),
    method:      z.enum(['standard', 'pickup', 'same-day']).optional(),
  }).optional();

  const checkoutSchema = z.object({
    items: z.array(
      z.object({
        id: z.string().min(1, 'Product ID required'),
        quantity: z.number().int().positive().max(100, 'Max 100 units per product'),
        variant: z.string().optional(),
        // Require Stripe price id provided by frontend
        stripe_price_id: z.string().min(1, 'Stripe price ID required')
      })
    ).min(1, 'Cart cannot be empty').max(50, 'Max 50 different products'),
    shippingMethod: z.enum(['standard', 'pickup', 'same-day'], {
      errorMap: () => ({ message: 'Invalid shipping method' })
    }),
    email: z.string().email('Invalid email').optional(),
    name: z.string().min(2).max(100).optional(),
    shippingAddress: shippingAddressSchema
  });

  let items, shippingMethod, metadata, shippingAddress;
  try {
    // Aceitar ambos formatos: { items: [...] } (server) ou { cartItems: [...] } (frontend)
    const rawItems = req.body.items || req.body.cartItems;
    if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ error: 'Invalid request data', details: [{ field: 'items', message: 'Cart cannot be empty' }] });
    }
    const payload = {
      items: rawItems,
      shippingMethod: req.body.shippingMethod || (req.body.shippingAddress && req.body.shippingAddress.method) || 'standard',
      customer_email: req.body.customer_email || req.body.email || (req.body.metadata && req.body.metadata.customer_email),
      name: req.body.name || (req.body.metadata && req.body.metadata.customer_name)
    };

    // Validação robusta do input usando o payload normalizado
    const validatedData = checkoutSchema.parse(payload);
    items = validatedData.items;
    shippingMethod = validatedData.shippingMethod;
    metadata = req.body.metadata || {};
    shippingAddress = req.body.shippingAddress || {};
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodErrors = Array.isArray(error.errors) ? error.errors : [];
      logger.warn('Invalid request data', { errors: zodErrors });
      return res.status(400).json({
        error: 'Invalid request data',
        details: zodErrors.map(e => ({
          field: Array.isArray(e.path) ? e.path.join('.') : '',
          message: e.message || 'Invalid value'
        }))
      });
    }
    logger.error('Unexpected error during validation', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    // Debug logging (sanitized)
    // Use a single literal for the log message so it appears once in the file
    const BACKEND_RECEIVED = 'Backend received';
    // Log detailed info in development, summarized info in production
    if (process.env.NODE_ENV === 'development') {
      logger.info(BACKEND_RECEIVED, {
        items: items.map(item => ({ id: item.id, quantity: item.quantity })),
        shippingMethod,
        availableProducts: Object.keys(stripeProducts).length
      });
    } else {
      logger.info(BACKEND_RECEIVED, {
        itemsCount: items.length,
        shippingMethod
      });
    }

    // Rate limiting (per IP) using Firestore
    try {
      // On Vercel, x-real-ip is set by infrastructure and is not client-spoofable.
      // x-forwarded-for is used as fallback but validated against IPv4/IPv6 format
      // to prevent attackers from forging arbitrary document keys in Firestore.
      const rawIp = req.headers['x-real-ip']
        || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null)
        || (req.socket && req.socket.remoteAddress)
        || 'unknown';
      const ip = /^[\w.:[\]-]{3,45}$/.test(rawIp) ? rawIp : 'unknown';
      const rateKey = `ip_${ip}`;
      const rl = await checkRateLimit(rateKey);
      if (!rl.allowed) {
        const retryAfter = rl.resetAt ? Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000) : 60;
        return res.status(429).json({ error: 'Too many requests', retryAfter });
      }
    } catch (e) {
      logger.error('Rate limit check failed, allowing request', e);
    }

    // Improved error handling
    try {
      const crypto = require('crypto');
      const totals = await validateAndCalculateTotal(
        items,
        shippingAddress,
        req.body.couponCode || req.body.coupon || null,
        Number(req.body.discount || 0),
        req.body.customer_email || req.body.email || (req.body.metadata && req.body.metadata.customer_email) || ''
      );
      logger.info('Backend price validation passed', {
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        vat: totals.vat,
        total: totals.total
      });

      // Gera hash único baseado nos itens + shipping + timestamp arredondado (5 min)
      const cartHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          items: items.map(i => ({ id: i.id, qty: i.quantity })),
          shipping: shippingAddress?.method,
          timestamp: Math.floor(Date.now() / 300000) // 5 minutos
        }))
        .digest('hex');
      const emailHash = crypto.createHash('sha256').update(req.body.customer_email || req.body.email || (metadata && metadata.customer_email) || 'guest').digest('hex').substring(0, 8);
      const idempotencyKey = `pi_${emailHash}_${cartHash}`;

      // Build a sanitized metadata object (whitelist) to avoid client-side injection
      const incomingMetadata = req.body.metadata || {};
      // Build compact items JSON — Stripe metadata values are capped at 500 chars.
      // Slice items array until the serialised string fits safely within 490 chars.
      const buildItemsMeta = (itemsArr) => {
        const full = JSON.stringify(itemsArr.map(it => ({ id: it.id, v: it.variant || '', q: it.quantity })));
        if (full.length <= 490) return full;
        // Drop items from the end until it fits
        for (let len = itemsArr.length - 1; len > 0; len--) {
          const candidate = JSON.stringify(itemsArr.slice(0, len).map(it => ({ id: it.id, v: it.variant || '', q: it.quantity })));
          if (candidate.length <= 490) {
            logger.warn('items metadata truncated to fit Stripe 500-char limit', { original: itemsArr.length, kept: len });
            return candidate;
          }
        }
        return '[]';
      };

      const metadataSanitized = {
        // allow only minimal, non-sensitive fields from client
        customer_email: incomingMetadata.customer_email || incomingMetadata.email || '',
        customer_name: incomingMetadata.customer_name || incomingMetadata.name || '',
        // Store compact items representation — guarded against Stripe 500-char value limit
        items: buildItemsMeta(items),
        subtotal_cents: String(Math.round(totals.subtotal * 100)),
        shipping_cents: String(Math.round(totals.shipping * 100)),
        // Include phone as a safety backup (also set structured `shipping` on PaymentIntent)
        phone: (shippingAddress && (shippingAddress.phone || shippingAddress.phoneNumber)) || incomingMetadata.phone || '',
        backend_validated: 'true',
        referral_code: String(req.body.referral_code || '').toUpperCase().trim()
      };
      metadata = metadataSanitized;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totals.total * 100), // Convert to cents
        currency: 'eur',
        // Include shipping on the PaymentIntent so webhooks can read a structured
        // address from `paymentIntent.shipping` (preferred over metadata parsing).
        shipping: {
          name: metadata.customer_name || req.body.name || `${(shippingAddress.firstName || '')} ${(shippingAddress.lastName || '')}`.trim(),
          phone: shippingAddress.phone || metadata.phone || '',
          address: {
            line1: shippingAddress.line1 || shippingAddress.address || '',
            line2: shippingAddress.line2 || shippingAddress.address2 || '',
            city: shippingAddress.city || '',
            state: shippingAddress.state || '',
            postal_code: shippingAddress.postalCode || shippingAddress.postal_code || '',
            country: shippingAddress.country || ''
          }
        },
        metadata: {
          ...metadata,
          shipping_method: req.body.shippingMethod || (req.body.shippingAddress && req.body.shippingAddress.method) || 'standard',
          subtotal: totals.subtotal.toFixed(2),
          shipping: totals.shipping.toFixed(2),
          vat: totals.vat.toFixed(2),
          items_count: items.length,
          backend_validated: 'true', // Security flag
          coupon_code: (req.body.couponCode || ''),
          discount_amount: String(Number(totals.discount || 0).toFixed(2))
        },
        automatic_payment_methods: {
          enabled: true,
        },
      }, {
        idempotencyKey: idempotencyKey
      });

      return res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        calculatedTotals: totals // Send back for frontend verification
      });
    } catch (error) {
      captureException(error, {
        endpoint: 'create-payment-intent',
        context: { items, shippingAddress }
      });
      logger.error('Error creating payment intent', error.message);
      if (error.message.includes('Invalid')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create payment intent' });
    }
  } catch (error) {
    captureException(error, {
      endpoint: 'create-payment-intent',
      context: { items: req.body?.items || req.body?.cartItems, shippingAddress: req.body?.shippingAddress }
    });
    logger.error('Error processing request', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
