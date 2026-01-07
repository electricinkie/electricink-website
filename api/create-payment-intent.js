const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { captureException } = require('./lib/sentry');
const { z } = require('zod');
const logger = require('./lib/logger');
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
function loadProducts() {
  const dataDir = path.join(__dirname, '..', 'data');
  let merged = {};
  try {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const obj = require(path.join('..', 'data', file));
        if (obj && typeof obj === 'object') merged = { ...merged, ...obj };
      } catch (e) {
        console.warn('Failed to load data file', file, e && e.message);
      }
    }

    // Normalize product shape to support legacy files that use top-level `price`
    // and ensure `product.basic.price` exists as the backend expects.
    for (const [id, product] of Object.entries(merged)) {
      if (!product || typeof product !== 'object') continue;

      // If product has `price` but no `basic`, create `basic` structure
      if (!product.basic && typeof product.price === 'number') {
        merged[id].basic = { price: product.price };
      }

      // If product has variants but no `price`, use the first variant
      if (!product.price && product.variants && product.variants[0]) {
        merged[id].price = product.variants[0].price;
        if (!merged[id].basic) {
          merged[id].basic = { price: product.variants[0].price };
        }
      }
    }
  } catch (err) {
    console.warn('Data directory not found or unreadable:', err && err.message);
  }
  return merged;
}

const stripeProducts = loadProducts();
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using base64-encoded service account JSON
function initFirestore() {
  if (admin.apps && admin.apps.length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set; Firestore rate limiting disabled');
    return;
  }
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    let serviceAccount;

    // Support either base64-encoded JSON (existing convention) or raw JSON
    if (raw.trim().startsWith('{')) {
      serviceAccount = JSON.parse(raw);
    } else {
      serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    logger.error('Failed to initialize Firebase Admin', err);
  }
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
        tx.set(docRef, { count: 1, resetAt });
        return { allowed: true, remaining: LIMIT - 1, resetAt: resetAt.toDate() };
      }

      const data = doc.data() || {};
      const resetAtMillis = (data.resetAt && typeof data.resetAt.toMillis === 'function') ? data.resetAt.toMillis() : (data.resetAt || 0);

      if (now > resetAtMillis) {
        const resetAt = admin.firestore.Timestamp.fromMillis(now + WINDOW_SECONDS * 1000);
        tx.set(docRef, { count: 1, resetAt });
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
    // Fail open: if rate limiter fails, allow the request
    return { allowed: true };
  }
}

/**
 * Calculate shipping cost based on subtotal and address
 * @param {number} subtotal - Cart subtotal in EUR
 * @param {object} address - Shipping address with postalCode
 * @returns {number} Shipping cost in EUR
 */
function calculateShipping(subtotal, address = {}) {
  const FREE_SHIPPING_THRESHOLD = 130;
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

function validateAndCalculateTotal(cartItems, shippingAddress = {}) {
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
    if (isNaN(quantity) || quantity <= 0 || quantity > 999) {
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

  // Calculate VAT (23%)
  const VAT_RATE = 0.23;
  const vat = (subtotal + shipping) * VAT_RATE;

  // Calculate final total
  const total = subtotal + shipping + vat;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shipping: parseFloat(shipping.toFixed(2)),
    vat: parseFloat(vat.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

module.exports = async function handler(req, res) {
  // CORS headers
  const ALLOWED_ORIGINS = [
    'https://electricink-website.vercel.app',
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
  const checkoutSchema = z.object({
    items: z.array(
      z.object({
        id: z.string().min(1, 'Product ID required'),
        quantity: z.number().int().positive().max(100, 'Max 100 units per product'),
        variant: z.string().optional()
      })
    ).min(1, 'Cart cannot be empty').max(50, 'Max 50 different products'),
    shippingMethod: z.enum(['standard', 'express', 'pickup', 'same-day'], {
      errorMap: () => ({ message: 'Invalid shipping method' })
    }),
    email: z.string().email('Invalid email').optional(),
    name: z.string().min(2).max(100).optional()
  });

  let items, shippingMethod, metadata, shippingAddress;
  try {
    // Aceitar ambos formatos: { items: [...] } (server) ou { cartItems: [...] } (frontend)
    const payload = {
      items: req.body.items || req.body.cartItems,
      shippingMethod: req.body.shippingMethod || (req.body.shippingAddress && req.body.shippingAddress.method) || 'standard',
      email: req.body.email || (req.body.metadata && req.body.metadata.customer_email),
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
      logger.warn('Invalid request data', { errors: error.errors });
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    logger.error('Unexpected error during validation', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    // Debug logging (sanitized)
    logger.info('Backend received', {
      items: items.map(item => ({ id: item.id, quantity: item.quantity })),
      shippingMethod,
      availableProducts: Object.keys(stripeProducts).length
    });

    // Rate limiting (per IP) using Firestore
    try {
      const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket && req.socket.remoteAddress) || 'unknown';
      const rateKey = `ip_${ip}`;
      const rl = await checkRateLimit(rateKey);
      if (!rl.allowed) {
        const retryAfter = rl.resetAt ? Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000) : 60;
        return res.status(429).json({ error: 'Too many requests', retryAfter });
      }
    } catch (e) {
      console.error('Rate limit check failed, allowing request:', e);
    }

    // Improved error handling
    try {
      const crypto = require('crypto');
      const totals = validateAndCalculateTotal(items, shippingAddress);
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
      const idempotencyKey = `pi_${cartHash}`;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totals.total * 100), // Convert to cents
        currency: 'eur',
        metadata: {
          ...metadata,
          subtotal: totals.subtotal.toFixed(2),
          shipping: totals.shipping.toFixed(2),
          vat: totals.vat.toFixed(2),
          items_count: items.length,
          backend_validated: 'true' // Security flag
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
