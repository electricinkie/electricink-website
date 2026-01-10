// Email configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'electricink.ie@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@electricink.ie';
function validateMetadata(metadata = {}) {
  const validated = {
    email: metadata.customer_email || 'no-email@electricink.ie',
    name: metadata.customer_name || 'Customer',
    phone: metadata.phone || '',
    addressLine1: metadata.addressLine1 || metadata.street || 'Address not provided',
    addressLine2: metadata.addressLine2 || metadata.complement || '',
    city: metadata.city || 'Dublin',
    state: metadata.state || 'Leinster',
    postalCode: metadata.postalCode || metadata.postal_code || '',
    country: metadata.country || 'IE'
  };

  const hasIncompleteData = (
    !metadata.customer_email ||
    !metadata.customer_name,
    !metadata.addressLine1 && !metadata.street ||
    !metadata.postalCode && !metadata.postal_code
  );

  if (hasIncompleteData) {
    logger.warn('Incomplete metadata detected', {
      hasEmail: !!metadata.customer_email,
      hasName: !!metadata.customer_name,
      hasAddress: !!(metadata.addressLine1 || metadata.street),
      hasPostalCode: !!(metadata.postalCode || metadata.postal_code)
    });
  }

  return validated;
}
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
const { getFirestore, admin } = require('./lib/firebase-admin');
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
  console.log('\n🟢 WEBHOOK INICIADO');
  console.log('🟢 Method:', req.method);
  console.log('🟢 URL:', req.url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature, x-request-id');

  // Gera requestId único
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
    console.error('❌ STRIPE_WEBHOOK_SECRET não configurado');
    return res.status(500).json({ error: 'Webhook secret not configured', requestId });
  }

  // Validate Resend (non-blocking)
  try {
    const configCheck = await validateResendConfig();
    console.log('[RESEND-CONFIG] Validation:', configCheck);
  } catch (e) {
    console.error('[RESEND-CONFIG] Validation failed:', e && e.message);
  }

  let event;

  try {
    // CORREÇÃO CRÍTICA: Usar req.body se já foi processado por express.raw()
    let rawBody;
    
    if (req.body && Buffer.isBuffer(req.body)) {
      // Dev-server com express.raw() - body já processado
      rawBody = req.body;
      console.log('🔍 Usando req.body (express.raw)');
    } else if (req.body && typeof req.body === 'string') {
      // Body como string
      rawBody = Buffer.from(req.body);
      console.log('🔍 Convertendo string para Buffer');
    } else {
      // Vercel/produção - ler stream
      rawBody = await getRawBody(req);
      console.log('🔍 Usando getRawBody (stream)');
    }
    
    console.log('🔍 Raw body length:', rawBody.length);

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    console.log('✅ Assinatura verificada!');
    console.log('✅ Event type:', event.type);
    console.log('✅ Event ID:', event.id);

    logger.info(JSON.stringify({
      msg: 'Webhook verified',
      eventType: event.type,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'verified'
    }));
  } catch (err) {
    console.error('❌ Erro na verificação de assinatura:', err.message);
    captureException(err, {
      endpoint: 'webhooks-stripe',
      context: { eventType: 'signature-verification', requestId }
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
        console.log('🎯 Chamando handlePaymentIntentSucceeded...');
        await handlePaymentIntentSucceeded(event, requestId);
        console.log('🎯 handlePaymentIntentSucceeded concluído');
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
    console.log('✅ Retornando 200');
    res.status(200).json({ received: true, requestId });
  } catch (error) {
    console.error('\n❌❌❌ ERRO NO PROCESSAMENTO ❌❌❌');
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    
    logger.error(JSON.stringify({
      msg: 'Webhook processing error',
      error: error && error.message,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'error'
    }));
    captureException(error);
    
    return res.status(500).json({ 
      error: 'Webhook processing failed',
      reason: error.message,
      requestId
    });
  }
};

/**
 * Remove campos undefined recursivamente
 */
function removeUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined).filter(item => item !== undefined);
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefined(value);
      }
      return acc;
    }, {});
  }
  return obj;
}

/**
 * Handle successful payment
 */
// Validate and fill defaults for possibly-truncated Stripe metadata
function validateMetadata(metadata) {
  const validated = {
    email: metadata.customer_email || 'no-email@electricink.ie',
    name: metadata.customer_name || 'Customer',
    phone: metadata.phone || '',
    addressLine1: metadata.addressLine1 || 'Address not provided',
    addressLine2: metadata.addressLine2 || '',
    city: metadata.city || 'Dublin',
    state: metadata.state || 'Leinster',
    postalCode: metadata.postalCode || '',
    country: metadata.country || 'IE'
  };
  // Log se metadata parece incompleta
  const hasIncompleteData = 
    !metadata.customer_email || 
    !metadata.customer_name || 
    !metadata.addressLine1 || 
    !metadata.postalCode;
  if (hasIncompleteData) {
    logger.warn('Incomplete metadata detected', {
      hasEmail: !!metadata.customer_email,
      hasName: !!metadata.customer_name,
      hasAddress: !!metadata.addressLine1,
      hasPostalCode: !!metadata.postalCode
    });
  }
  return validated;
}

async function handlePaymentIntentSucceeded(event, requestId) {
  const db = getFirestore();
  const paymentIntent = event.data.object;
  const validatedMetadata = validateMetadata(paymentIntent.metadata);
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const shippingAddress = {
      line1: validatedMetadata.addressLine1,
      line2: validatedMetadata.addressLine2,
      city: validatedMetadata.city,
      state: validatedMetadata.state,
      postalCode: validatedMetadata.postalCode,
      country: validatedMetadata.country
    };
    const orderId = paymentIntent.id; // ID único do Stripe
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

    // Compact metadata format: [{id, v, q}] -> expand to enriched items
    const enrichedItems = (items || []).map(it => ({
      id: it.id,
      variant: it.v || null,
      quantity: it.q || 1
    }));

    // Usar apenas campos *_cents da metadata (valores em cents)
    const subtotal_cents = parseInt(paymentIntent.metadata.subtotal_cents || '0', 10);
    const shipping_cents = parseInt(paymentIntent.metadata.shipping_cents || '0', 10);
    const discount_cents = parseInt(paymentIntent.metadata.discount_cents || '0', 10);
    const discount_percent = parseFloat(paymentIntent.metadata.discount_percent || paymentIntent.metadata.discount || '0');

    const customerEmail = paymentIntent.metadata.customer_email || paymentIntent.receipt_email || 'no-email@electricink.ie';
    const customerName = paymentIntent.metadata.customer_name || 'Customer';
    const order = {
      orderId,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer || null,
      // Monetary values stored in cents (integer)
      amount: paymentIntent.amount, // total in cents
      currency: paymentIntent.currency,
      status: 'paid',
      paymentStatus: paymentIntent.status,
      customerEmail,
      customerName,
      customerPhone: validatedMetadata.phone,
      shippingAddress: {
        line1: validatedMetadata.addressLine1,
        line2: validatedMetadata.addressLine2,
        city: validatedMetadata.city,
        state: validatedMetadata.state,
        postalCode: validatedMetadata.postalCode,
        country: validatedMetadata.country
      },
      items: enrichedItems,
      shippingMethod: paymentIntent.metadata.shippingMethod || null,
      shippingCost_cents: shipping_cents,
      subtotal_cents: subtotal_cents,
      total_cents: paymentIntent.amount,
      // Backwards-compatible human-readable values (EUR)
      shippingCost: (shipping_cents / 100),
      // `subtotal` remains pre-discount; include discount fields separately
      subtotal: (subtotal_cents / 100),
      discount_cents: discount_cents,
      discount_percent: discount_percent,
      discounted_subtotal: ((subtotal_cents - discount_cents) / 100),
      total: (paymentIntent.amount / 100),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'webhook',
      webhookEventId: event.id
    };
    // Associate `userId` when PaymentIntent metadata contains an authenticated UID.
    // We accept a few possible metadata keys for compatibility with older clients.
    const userIdFromMetadata = paymentIntent.metadata?.user_uid || paymentIntent.metadata?.authUid || paymentIntent.metadata?.userId || paymentIntent.metadata?.user_id || null;
    if (userIdFromMetadata) {
      // Attach canonical `userId` field so Firestore reads/queries can use UID-first lookup.
      order.userId = String(userIdFromMetadata);
    } else {
      // When absent, we intentionally leave `userId` undefined (guest flow).
      // Webhook-created guest orders will still have `customerEmail` for email-based lookup.
    }
    // Tentar criar document com ID específico (atomicidade)
    const orderRef = db.collection('orders').doc(orderId);
    console.log('🔍 Iniciando transaction para order:', orderId);
    console.log('🔍 Order ref path:', orderRef.path);
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
      const cleanOrder = removeUndefined(order);
      console.log('🧹 Order original fields:', Object.keys(order).length);
      console.log('🧹 Order limpa fields:', Object.keys(cleanOrder).length);
      transaction.set(orderRef, cleanOrder);
      console.log('✅ Transaction.set executado');
    });
    console.log('✅ Order criada com sucesso no Firestore');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(JSON.stringify({
      msg: 'Order created successfully',
      orderId,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'created'
    }));

    // Integrate OMS: enrich order with sequential orderNumber and events
    try {
      // OrderManager exports the class
      const OrderManager = require('./oms/order-manager');
      const orderManager = new OrderManager(db);
      const generated = await orderManager.enrichOrder(orderId);
      logger.info(JSON.stringify({
        msg: 'OMS enrichment completed',
        orderId,
        orderNumber: generated,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'oms_enriched'
      }));
    } catch (omsErr) {
      console.error('[OMS] enrichOrder failed for', orderId, omsErr && omsErr.message);
      // Non-blocking: capture but continue with email flow
      try { captureException(omsErr); } catch (e) { /* ignore */ }
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
            from: `Electric Ink <${EMAIL_FROM}>`,
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
          from: EMAIL_FROM,
          to: ADMIN_EMAIL,
          subject: `New Order ${orderId}`,
          hasHtml: !!adminEmailHtml,
          htmlLength: adminEmailHtml?.length
        });

        try {
          console.log('[EMAIL-DEBUG] Calling Resend API...');
          const startTime = Date.now();

          const adminEmailResult = await resend.emails.send({
            from: `Electric Ink Orders <${EMAIL_FROM}>`,
            to: [ADMIN_EMAIL],
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
            const emailUpdate = removeUndefined({
              adminEmailStatus: 'sent',
              adminEmailId: adminEmailResult.id,
              adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').doc(orderId).update(emailUpdate);
          }

        } catch (emailError) {
          console.error('[EMAIL-DEBUG] ❌ Admin email FAILED', {
            errorName: emailError.name,
            errorMessage: emailError.message,
            errorCode: emailError.statusCode,
            errorDetails: JSON.stringify(emailError, null, 2)
          });

          if (db) {
            const emailErrorUpdate = removeUndefined({
              adminEmailStatus: 'failed',
              adminEmailError: emailError.message,
              adminEmailErrorCode: emailError.statusCode,
              adminEmailFailedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').doc(orderId).update(emailErrorUpdate);

            await db.collection('failed_emails').add(removeUndefined({
              type: 'admin',
              orderId: orderId,
              orderData: { orderId },
              error: emailError.message,
              errorCode: emailError.statusCode,
              attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
              retryCount: 0
            }));
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
  // Log basic failure info
  logger.info('Payment intent failed', {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    email: paymentIntent.metadata?.customer_email || paymentIntent.receipt_email || 'unknown',
    requestId
  });

  try {
    const db = getFirestore();
    await db.collection('failed_payments').doc(paymentIntent.id).set({
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customerEmail: paymentIntent.metadata?.customer_email || paymentIntent.receipt_email || 'unknown',
      failureReason: paymentIntent.last_payment_error?.message || 'Unknown error',
      failureCode: paymentIntent.last_payment_error?.code || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: paymentIntent.metadata || {}
    });

    logger.info('Failed payment recorded', { paymentIntentId: paymentIntent.id, requestId });
  } catch (error) {
    logger.error('Error recording failed payment', error, { paymentIntentId: paymentIntent.id, requestId });
    // Do not fail the webhook on logging error
  }

  return { processed: true };
}

/**
 * Handle refund
 */
async function handleChargeRefunded(charge, requestId) {
  logger.info('Charge refunded', {
    chargeId: charge.id,
    paymentIntentId: charge.payment_intent || null,
    amount_refunded: charge.amount_refunded,
    requestId
  });

  if (!charge.payment_intent) {
    logger.warn('No payment_intent in refunded charge', { chargeId: charge.id, requestId });
    return { processed: true };
  }

  try {
    const db = getFirestore();
    const orderRef = db.collection('orders').doc(charge.payment_intent);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      logger.warn('Order not found for refunded charge', { paymentIntentId: charge.payment_intent, requestId });
      return { processed: true };
    }

    await orderRef.update({
      status: 'refunded',
      paymentStatus: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      refundAmount: charge.amount_refunded,
      refundReason: (charge.refunds && charge.refunds.data && charge.refunds.data[0] && charge.refunds.data[0].reason) || 'Not specified',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info('Order status updated to refunded', { orderId: charge.payment_intent, requestId });
  } catch (error) {
    logger.error('Error updating refunded order', error, { chargeId: charge.id, requestId });
    throw error; // Stripe will retry
  }

  return { processed: true };
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
