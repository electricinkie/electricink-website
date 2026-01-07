/**
 * STRIPE WEBHOOKS HANDLER (Vercel Serverless)
 * Converted to CommonJS for compatibility
 */

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { captureException } = require('./lib/sentry');
const admin = require('firebase-admin');
const logger = require('./lib/logger');

// Initialize Firebase Admin if credentials are provided
if (!admin.apps || !admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('FIREBASE_SERVICE_ACCOUNT not configured; Firestore operations disabled');
    } else {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      let serviceAccount;
      if (raw.trim().startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else {
        serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      }
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('✅ Firebase Admin initialized');
    }
  } catch (e) {
    console.warn('Failed to initialize Firebase Admin', e && e.message);
  }
}

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
        await handlePaymentIntentSucceeded(event.data.object, event);
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
async function handlePaymentIntentSucceeded(paymentIntent, event) {
  try {
    logger.info('Processing payment_intent.succeeded', { paymentIntentId: paymentIntent.id });

    // 1. Gera orderId único
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 2. Parse items do metadata
    let items = [];
    try {
      items = JSON.parse(paymentIntent.metadata.items || '[]');
    } catch (e) {
      logger.error('Failed to parse items from metadata', e);
      items = [];
    }

    // 3. Monta documento do pedido
    const orderData = {
      orderId,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer || null,
      
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      
      status: 'paid',
      paymentStatus: paymentIntent.status,
      
      customerEmail: paymentIntent.metadata.email,
      customerName: paymentIntent.metadata.name,
      customerPhone: paymentIntent.metadata.phone || null,
      
      shippingAddress: {
        street: paymentIntent.metadata.street,
        number: paymentIntent.metadata.number,
        complement: paymentIntent.metadata.complement || null,
        neighborhood: paymentIntent.metadata.neighborhood,
        city: paymentIntent.metadata.city,
        state: paymentIntent.metadata.state,
        postalCode: paymentIntent.metadata.postalCode,
        country: paymentIntent.metadata.country || 'IE'
      },
      
      items,
      
      shippingMethod: paymentIntent.metadata.shippingMethod,
      shippingCost: parseInt(paymentIntent.metadata.shippingCost || 0),
      
      subtotal: parseInt(paymentIntent.metadata.subtotal || 0),
      total: paymentIntent.amount,
      
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      
      source: 'webhook',
      webhookEventId: event.id
    };

    // 4. Salva no Firestore
    if (!admin.apps || !admin.apps.length) {
      logger.warn('Firestore not initialized; skipping order save', { orderId });
    } else {
      const db = admin.firestore();
      await db.collection('orders').doc(orderId).set(orderData);
      logger.info('✅ Order saved to Firestore', { orderId });
    }

    // 5. Envia email de confirmação (fallback)
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://electricink-website.vercel.app';

      const emailData = {
        orderNumber: orderId,
        email: orderData.customerEmail,
        items: orderData.items,
        totals: {
          subtotal: orderData.subtotal,
          shipping: orderData.shippingCost,
          total: orderData.total
        },
        shipping: orderData.shippingAddress
      };

      // Customer confirmation
      const custResp = await fetch(`${baseUrl}/api/send-order-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order-confirmation', data: emailData })
      });

      if (custResp.ok) {
        logger.info('✅ Confirmation email sent', { orderId });
      } else {
        logger.warn('⚠️ Email sending failed (non-critical)', { orderId, status: custResp.status });
      }

      // Admin notification
      const adminResp = await fetch(`${baseUrl}/api/send-order-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order-notification-admin', data: emailData })
      });

      if (adminResp.ok) {
        logger.info('✅ Admin notification email sent', { orderId });
      } else {
        logger.warn('⚠️ Admin email failed (non-critical)', { orderId, status: adminResp.status });
      }

    } catch (emailError) {
      logger.warn('⚠️ Email error (non-critical)', emailError);
    }

    return { success: true, orderId };

  } catch (error) {
    logger.error('❌ Error in handlePaymentIntentSucceeded', error);
    captureException(error, { 
      context: 'webhook-payment-intent-succeeded',
      paymentIntentId: paymentIntent.id 
    });
    throw error; // Re-throw para Stripe retentar
  }
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
