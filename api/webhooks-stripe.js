// Validar Firestore em produção
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is required in production');
  }
}

/**
 * STRIPE WEBHOOKS HANDLER (Vercel Serverless)
 * Converted to CommonJS for compatibility
 */

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { captureException } = require('./lib/sentry');
const admin = require('firebase-admin');
const logger = require('./lib/logger');
const { v4: uuidv4 } = require('uuid');

// Initialize Resend for direct email sending (guarded: do not throw if API key missing)
const { Resend } = require('resend');
let resend = null;
try {
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('[RESEND-INIT] ✓ Resend initialized successfully');
  } else {
    console.error('[RESEND-INIT] ❌ RESEND_API_KEY not found');
  }
} catch (error) {
  console.error('[RESEND-INIT] ❌ Failed to initialize:', error);
}

// Initialize Firebase Admin (fail-closed)
if (!admin.apps || !admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is required for Firestore');
    }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    let serviceAccount;
    if (raw.trim().startsWith('{')) {
      serviceAccount = JSON.parse(raw);
    } else {
      serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('\u2705 Firebase Admin initialized');
  } catch (e) {
    console.error('Failed to initialize Firebase Admin:', e);
    throw e;
  }
}

// Vercel serverless config
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Helper: validate Resend configuration (domains, verification)
async function validateResendConfig() {
  if (!resend) {
    return { valid: false, error: 'Resend not initialized' };
  }

  try {
    const domains = await resend.domains.list();
    console.log('[RESEND-CONFIG] Domains configured:', 
      domains?.data?.map(d => `${d.name} (${d.status})`).join(', ')
    );

    const electricinkDomain = domains?.data?.find(d => 
      d.name === 'electricink.ie'
    );

    if (!electricinkDomain) {
      return { 
        valid: false, 
        error: 'Domain electricink.ie not found in Resend' 
      };
    }

    if (electricinkDomain.status !== 'verified') {
      return { 
        valid: false, 
        error: `Domain status: ${electricinkDomain.status}` 
      };
    }

    return { valid: true, domain: electricinkDomain };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Main webhook handler
 */
module.exports = async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature, x-request-id');

  // Gera requestId único para cada requisição
  const requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', requestId);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', requestId });
  }


  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error(JSON.stringify({
      msg: 'STRIPE_WEBHOOK_SECRET not configured',
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'error'
    }));
    return res.status(500).json({ error: 'Webhook secret not configured', requestId });
  }

  // Validate Resend configuration early (non-blocking for webhook validity)
  try {
    const configCheck = await validateResendConfig();
    console.log('[RESEND-CONFIG] Validation:', configCheck);
  } catch (e) {
    console.error('[RESEND-CONFIG] Validation failed:', e && e.message);
  }
  let event;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    logger.info(JSON.stringify({
      msg: 'Webhook verified',
      eventType: event.type,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'verified'
    }));
  } catch (err) {
    captureException(err, {
      endpoint: 'webhooks-stripe',
      context: { eventType: 'signature-verification', sig: req.headers['stripe-signature'], requestId }
    });
    logger.error(JSON.stringify({
      msg: 'Webhook signature verification failed',
      error: err && err.message,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'error'
    }));
    return res.status(400).json({ error: `Webhook Error: ${err.message}`, requestId });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event, requestId);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object, requestId);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object, requestId);
        break;
      default:
        logger.warn(JSON.stringify({
          msg: `Unhandled event type: ${event.type}`,
          orderId: null,
          requestId,
          timestamp: new Date().toISOString(),
          status: 'warn'
        }));
    }
    res.status(200).json({ received: true, requestId });
  } catch (error) {
    logger.error(JSON.stringify({
      msg: 'Webhook processing error',
      error: error && error.message,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'error'
    }));
    captureException(error);
    // Retornar 500 para erros de processamento transientes para que
    // Stripe possa re-tentar automaticamente. Somente ocultar falhas
    // não-retriáveis explicitamente.
    return res.status(500).json({ 
      error: 'Webhook processing failed',
      reason: error.message,
      requestId
    });
  }
};

/**
 * Handle successful payment
 */
async function handlePaymentIntentSucceeded(event, requestId) {
  try {
    // ============ IDEMPOTÊNCIA: usar paymentIntent.id como orderId ============
    const db = admin.apps && admin.apps.length ? admin.firestore() : null;
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.id; // ID único do Stripe

    // Fail-fast: if Firestore isn't initialized we MUST fail the webhook so Stripe retries
    if (!db) {
      const error = new Error('Firestore not initialized');
      logger.error(JSON.stringify({
        msg: 'Firestore not initialized - cannot save order', 
        orderId, 
        requestId, 
        timestamp: new Date().toISOString(), 
        status: 'error' 
      }));
      captureException(error, { context: 'webhook-firestore-init', requestId });
      throw error;
    } else {
      // Usar items direto do metadata (sem enrichment)
      let items = [];
      try {
        items = JSON.parse(paymentIntent.metadata.items || '[]');
      } catch (e) {
        logger.error(JSON.stringify({
          msg: 'Failed to parse items from metadata',
          error: e && e.message,
          orderId,
          requestId,
          timestamp: new Date().toISOString(),
          status: 'error'
        }));
        items = [];
      }

      // Prefer cents metadata (added by backend). Fallback to legacy fields.
      const subtotal_cents = parseInt(paymentIntent.metadata.subtotal_cents || paymentIntent.metadata.subtotal || '0', 10);
      const shipping_cents = parseInt(paymentIntent.metadata.shipping_cents || paymentIntent.metadata.shippingCost || '0', 10);

      const order = {
        orderId,
        paymentIntentId: paymentIntent.id,
        stripeCustomerId: paymentIntent.customer || null,
        // Monetary values stored in cents (integer)
        amount: paymentIntent.amount, // total in cents
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
        shippingCost_cents: shipping_cents,
        subtotal_cents: subtotal_cents,
        total_cents: paymentIntent.amount,
        // Backwards-compatible human-readable values (EUR)
        shippingCost: (shipping_cents / 100),
        subtotal: (subtotal_cents / 100),
        total: (paymentIntent.amount / 100),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'webhook',
        webhookEventId: event.id
      };
      // Tentar criar document com ID específico (atomicidade)
      const orderRef = db.collection('orders').doc(orderId);
      try {
        await db.runTransaction(async (transaction) => {
          const orderDoc = await transaction.get(orderRef);
          if (orderDoc.exists) {
            logger.info(JSON.stringify({
              msg: 'Order already processed (idempotent)',
              orderId,
              requestId,
              timestamp: new Date().toISOString(),
              status: 'idempotent'
            }));
            return;
          }
          transaction.set(orderRef, order);
        });
        logger.info(JSON.stringify({
          msg: 'Order created successfully',
          orderId,
          requestId,
          timestamp: new Date().toISOString(),
          status: 'created'
        }));
      } catch (error) {
        logger.error(JSON.stringify({
          msg: 'Transaction error',
          error: error && error.message,
          orderId,
          requestId,
          timestamp: new Date().toISOString(),
          status: 'error'
        }));
        throw error;
      }
    }

    // 5. Envia email de confirmação (NÃO-BLOQUEANTE) após salvar pedido
    if (!resend) {
      logger.warn(JSON.stringify({
        msg: 'Resend not initialized - skipping email notifications',
        orderId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'warn'
      }));
      // Atualizar order status para indicar falha
      if (db) {
        await db.collection('orders').doc(orderId).update({
          emailStatus: 'failed',
          emailError: 'Resend not configured',
          emailAdminStatus: 'skipped',
          emailAdminTimestamp: new Date().toISOString()
        });
      }
      return;
    }

    setImmediate(() => {
      (async () => {
        const emailLog = { orderId, requestId, timestamp: new Date().toISOString() };

        // cliente email (não-bloqueante)
        try {
          await resend.emails.send({
            from: 'Electric Ink <noreply@electricink.ie>',
            to: order.customerEmail,
            subject: `Order Confirmation #${orderId}`,
            html: `Order #${orderId} placed.`,
          });
          logger.info(JSON.stringify({ ...emailLog, status: 'client_email_sent', timestamp: new Date().toISOString() }));
        } catch (clientErr) {
          logger.error(JSON.stringify({ ...emailLog, status: 'client_email_failed', error: clientErr && clientErr.message, timestamp: new Date().toISOString() }));
        }

        // ========== DEBUG EMAIL ADMIN - START ==========
        const adminEmailHtml = `Order #${orderId} placed.`;
        console.log('[EMAIL-DEBUG] Starting admin email send');
        console.log('[EMAIL-DEBUG] Environment check:', {
          resendConfigured: !!resend,
          hasApiKey: !!process.env.RESEND_API_KEY,
          nodeEnv: process.env.NODE_ENV
        });

        console.log('[EMAIL-DEBUG] Email payload:', {
          from: 'orders@electricink.ie',
          to: 'electricink.ie@gmail.com',
          subject: `New Order ${orderId}`,
          hasHtml: !!adminEmailHtml,
          htmlLength: adminEmailHtml?.length
        });

        try {
          console.log('[EMAIL-DEBUG] Calling Resend API...');
          const startTime = Date.now();

          const adminEmailResult = await resend.emails.send({
            from: 'Electric Ink Orders <orders@electricink.ie>',
            to: ['electricink.ie@gmail.com'],
            subject: `New Order #${orderId}`,
            html: adminEmailHtml,
            tags: [
              { name: 'type', value: 'admin-notification' },
              { name: 'orderId', value: orderId }
            ]
          });

          const duration = Date.now() - startTime;

          console.log('[EMAIL-DEBUG] ✓ Admin email sent successfully', {
            emailId: adminEmailResult.id,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
          });

          if (db) {
            await db.collection('orders').doc(orderId).update({
              adminEmailStatus: 'sent',
              adminEmailId: adminEmailResult.id,
              adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

        } catch (emailError) {
          console.error('[EMAIL-DEBUG] ❌ Admin email FAILED', {
            errorName: emailError.name,
            errorMessage: emailError.message,
            errorCode: emailError.statusCode,
            errorDetails: JSON.stringify(emailError, null, 2)
          });

          if (db) {
            await db.collection('orders').doc(orderId).update({
              adminEmailStatus: 'failed',
              adminEmailError: emailError.message,
              adminEmailErrorCode: emailError.statusCode,
              adminEmailFailedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection('failed_emails').add({
              type: 'admin',
              orderId: orderId,
              orderData: { orderId },
              error: emailError.message,
              errorCode: emailError.statusCode,
              attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
              retryCount: 0
            });
          }

          console.warn('[EMAIL-DEBUG] Webhook continuing despite email failure');
        }
        console.log('[EMAIL-DEBUG] Admin email send complete');
        // ========== DEBUG EMAIL ADMIN - END ==========
      })();
    });
    logger.info(JSON.stringify({
      msg: 'Order saved, emails queued',
      orderId,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'queued'
    }));
    return { success: true, orderId, emailStatus: 'queued', requestId };

  } catch (error) {
    logger.error(JSON.stringify({
      msg: 'Error in handlePaymentIntentSucceeded',
      error: error && error.message,
      orderId: paymentIntent.id,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'error'
    }));
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
async function handlePaymentIntentFailed(paymentIntent, requestId) {
  logger.warn(JSON.stringify({
    msg: 'Payment failed',
    orderId: paymentIntent.id,
    requestId,
    timestamp: new Date().toISOString(),
    status: 'failed'
  }));
  const { orderId, customerEmail } = paymentIntent.metadata;
  // TODO: Update order status to 'failed'
  // TODO: Send failure notification email
  logger.warn(JSON.stringify({
    msg: 'Payment failed for order',
    orderId,
    requestId,
    timestamp: new Date().toISOString(),
    status: 'failed'
  }));
}

/**
 * Handle refund
 */
async function handleChargeRefunded(charge, requestId) {
  logger.info(JSON.stringify({
    msg: 'Charge refunded',
    orderId: null,
    chargeId: charge.id,
    requestId,
    timestamp: new Date().toISOString(),
    status: 'refunded'
  }));
  // TODO: Update order status
  // TODO: Send refund confirmation email
  logger.info(JSON.stringify({
    msg: 'Refund processed',
    orderId: null,
    chargeId: charge.id,
    amount: charge.amount_refunded / 100,
    requestId,
    timestamp: new Date().toISOString(),
    status: 'refunded'
  }));
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
