const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeProducts = require('../data/stripe-products.json');
const { Sentry } = require('./lib/sentry');

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
    
    // Send to Sentry if configured
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: {
          api: 'create-payment-intent',
          type: error.message.includes('Invalid') ? 'validation' : 'stripe_error'
        },
        contexts: {
          cart: {
            items_count: req.body.cartItems?.length || 0
          }
        }
      });
    }
    
    // Distinguish validation errors from Stripe errors
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to create payment intent' 
    });
  }
}
