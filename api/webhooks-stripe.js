/**
 * STRIPE WEBHOOKS HANDLER (Vercel Serverless)
 * Converted to CommonJS for compatibility
 */

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { captureException } = require('./lib/sentry');

// Vercel serverless config
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Main webhook handler
 */
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    
    console.log('✅ Webhook verified:', event.type);
  } catch (err) {
    captureException(err, {
      endpoint: 'webhooks-stripe',
      context: { eventType: 'signature-verification', sig: req.headers['stripe-signature'] }
    });
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    captureException(error, {
      endpoint: 'webhooks-stripe',
      context: { eventType: event?.type, paymentIntentId: event?.data?.object?.id }
    });
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

/**
 * Handle successful payment
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log('💳 Payment succeeded:', paymentIntent.id);
  
  // Extract order data from metadata
  const { orderId, customerEmail, orderNumber } = paymentIntent.metadata;

  // TODO: Update order status in database
  // TODO: Send confirmation email via Resend
  // TODO: Trigger inventory update

  console.log('Order completed:', {
    orderId,
    orderNumber,
    amount: paymentIntent.amount / 100,
    customerEmail,
  });
}

/**
 * Handle failed payment
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);
  
  const { orderId, customerEmail } = paymentIntent.metadata;

  // TODO: Update order status to 'failed'
  // TODO: Send failure notification email

  console.log('Payment failed for order:', orderId);
}

/**
 * Handle refund
 */
async function handleChargeRefunded(charge) {
  console.log('💰 Charge refunded:', charge.id);
  
  // TODO: Update order status
  // TODO: Send refund confirmation email

  console.log('Refund processed:', {
    chargeId: charge.id,
    amount: charge.amount_refunded / 100,
  });
}

/**
 * Get raw body from request (needed for Stripe signature verification)
 */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
