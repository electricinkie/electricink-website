const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

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
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err);
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
    console.error('Rate limit transaction failed:', err);
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
function validateAndCalculateTotal(cartItems, shippingAddress = {}) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Invalid cart: no items provided');
  }

  let subtotal = 0;

  // Calculate subtotal from backend prices (source of truth)
  for (const item of cartItems) {
    // Find product in stripe-products.json
    const product = stripeProducts[item.id];
    
    console.log(`🔍 Looking for product "${item.id}":`, product ? '✅ Found' : '❌ Not found');
    
    if (!product) {
      console.error(`❌ Available products:`, Object.keys(stripeProducts));
      throw new Error(`Invalid product ID: ${item.id}`);
    }

    if (!product.basic || typeof product.basic.price !== 'number') {
      throw new Error(`Invalid product data for: ${item.id}`);
    }

    const quantity = parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0 || quantity > 999) {
      throw new Error(`Invalid quantity for ${item.id}: ${item.quantity}`);
    }

    // Use BACKEND price (not frontend!)
    subtotal += product.basic.price * quantity;
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
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  try {
    // Parse request body
    const { cartItems, shippingAddress, metadata = {} } = req.body;

    // Debug logging
    console.log('🔍 Backend received:', {
      cartItems,
      shippingAddress,
      availableProducts: Object.keys(stripeProducts)
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

    // Validate and calculate totals on BACKEND (security critical!)
    const totals = validateAndCalculateTotal(cartItems, shippingAddress);

    console.log('✅ Backend price validation passed:', {
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      vat: totals.vat,
      total: totals.total
    });

    // Create Payment Intent with BACKEND-calculated amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totals.total * 100), // Convert to cents
      currency: 'eur',
      metadata: {
        ...metadata,
        subtotal: totals.subtotal.toFixed(2),
        shipping: totals.shipping.toFixed(2),
        vat: totals.vat.toFixed(2),
        items_count: cartItems.length,
        backend_validated: 'true' // Security flag
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Return client_secret
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      calculatedTotals: totals // Send back for frontend verification
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error.message);
    console.error('Stack:', error.stack);
    
    // Distinguish validation errors from Stripe errors
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: error.message
    });
  }
}
