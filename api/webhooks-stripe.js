// Prioriza .env.local sobre .env (para desenvolvimento local)
const path = require('path');
const fs = require('fs');
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
} else {
  require('dotenv').config({ path: envPath });
}

// Import logger early (needed for startup logs)
const logger = require('./lib/logger');

// Load email templates once at startup (used for client/admin emails)
let clientTemplateHtml = '';
let adminTemplateHtml = '';
try {
  clientTemplateHtml = fs.readFileSync(
    path.join(process.cwd(), 'email-templates', 'order-confirmation.html'),
    'utf8'
  );
  adminTemplateHtml = fs.readFileSync(
    path.join(process.cwd(), 'email-templates', 'order-notification-admin.html'),
    'utf8'
  );
  logger.info('Email templates loaded');
} catch (tplErr) {
  logger.warn('Email templates could not be loaded', { error: tplErr && tplErr.message });
}

// ===== ENV VARS VERIFICATION (STARTUP LOG) =====
if (process.env.NODE_ENV !== 'production') {
  logger.info('GitHub Inventory Config', {
    enabled: process.env.ENABLE_GITHUB_INVENTORY,
    hasToken: !!process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main'
  });
}

if (process.env.ENABLE_GITHUB_INVENTORY === 'true' && !process.env.GITHUB_TOKEN) {
  logger.error('ENABLE_GITHUB_INVENTORY is true but GITHUB_TOKEN is missing');
}
// ===== FIM ENV VARS VERIFICATION =====

// Product catalog loader (read-only, cached) - used ONLY for enriching email HTML
let PRODUCT_CATALOG_CACHE = null;
function loadProductCatalog() {
  if (PRODUCT_CATALOG_CACHE) return PRODUCT_CATALOG_CACHE;
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return [];
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    const catalog = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          catalog.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          // some files might be object maps; convert to array of values
          catalog.push(...Object.values(parsed));
        }
      } catch (e) {
        logger.warn('Failed to parse catalog file', { file: f, error: e && e.message });
      }
    }
    PRODUCT_CATALOG_CACHE = catalog;
    return PRODUCT_CATALOG_CACHE;
  } catch (err) {
    logger.error('loadProductCatalog error', { error: err && err.message });
    return [];
  }
}

// Email configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'electricink.ie@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@electricink.ie';
  // Consolidated validateMetadata - single robust definition
  function validateMetadata(metadata = {}) {
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
const { v4: uuidv4 } = require('uuid');

// Resend client helper
const { getResend } = require('./lib/resend');
const resend = getResend();

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

//

// Vercel serverless config
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Resend domain validation removed; per-webhook domains.list() was causing latency

/**
 * Main webhook handler
 */

module.exports = async function handler(req, res) {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Webhook started', { method: req.method });
  }


  // Secure CORS - only allow our domain
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature, x-request-id');

  // Gera requestId único
  const requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', requestId);

  // Warn early if Resend API key missing (emails will be skipped)
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[WEBHOOK] RESEND_API_KEY not configured - emails will be skipped');
  }

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
    logger.error('STRIPE_WEBHOOK_SECRET não configurado');
    return res.status(500).json({ error: 'Webhook secret not configured', requestId });
  }

  // Resend config validation removed to avoid per-webhook API calls

  let event;

  try {
    // CORREÇÃO CRÍTICA: Usar req.body se já foi processado por express.raw()
    let rawBody;
    
    if (req.body && Buffer.isBuffer(req.body)) {
      // Dev-server com express.raw() - body já processado
      rawBody = req.body;
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Using req.body (express.raw)');
      }
    } else if (req.body && typeof req.body === 'string') {
      // Body como string
      rawBody = Buffer.from(req.body);
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Converting string to Buffer');
      }
    } else {
      // Vercel/produção - ler stream
      rawBody = await getRawBody(req);
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Using getRawBody (stream)');
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Raw body length', { length: rawBody.length });
    }

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    if (process.env.NODE_ENV === 'development') {
      logger.debug('Webhook signature verified', { eventType: event.type, eventId: event.id });
    }

    logger.info(JSON.stringify({
      msg: 'Webhook verified',
      eventType: event.type,
      orderId: null,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'verified'
    }));
  } catch (err) {
    logger.error('Erro na verificação de assinatura', { error: err.message, requestId });
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
        // Security: require backend validation flag set when PaymentIntent was created
        try {
          const paymentIntent = event.data && event.data.object ? event.data.object : null;
          if (!paymentIntent || !(paymentIntent.metadata && paymentIntent.metadata.backend_validated === 'true')) {
            logger.error('Webhook rejected: metadata not validated', {
              paymentIntentIdLast4: paymentIntent && paymentIntent.id ? String(paymentIntent.id).slice(-4) : null,
              requestId
            });
            return res.status(400).json({ error: 'Invalid metadata - backend validation missing', requestId });
          }

        } catch (e) {
          logger.error('Error checking backend_validated flag', { error: e && e.message, requestId });
          return res.status(400).json({ error: 'Invalid metadata - backend validation check failed', requestId });
        }

        if (process.env.NODE_ENV === 'development') {
          logger.debug('Calling handlePaymentIntentSucceeded');
        }
        await handlePaymentIntentSucceeded(event, requestId);
        if (process.env.NODE_ENV === 'development') {
          logger.debug('handlePaymentIntentSucceeded completed');
        }
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
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Returning 200 OK');
    }
    res.status(200).json({ received: true, requestId });
  } catch (error) {
    logger.error('ERRO NO PROCESSAMENTO', { 
      error: error.message, 
      stack: error.stack,
      requestId 
    });
    
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
  // (duplicate removed) validateMetadata consolidated at top of file

async function handlePaymentIntentSucceeded(event, requestId) {
  const db = getFirestore();
  const paymentIntent = event.data.object;
  const validatedMetadata = validateMetadata(paymentIntent.metadata);
  // Prefer structured shipping phone when available (Stripe paymentIntent.shipping.phone)
  try {
    validatedMetadata.phone = (paymentIntent.shipping && paymentIntent.shipping.phone) || paymentIntent.metadata && paymentIntent.metadata.phone || validatedMetadata.phone || '';
  } catch (e) {
    // Safety: keep whatever validatedMetadata already had
    validatedMetadata.phone = validatedMetadata.phone || '';
  }
  try {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Processing shipping address');
    }
    // Prefer Stripe's provided shipping address (paymentIntent.shipping.address)
    // Fall back to metadata fields if Stripe shipping is not present.
    const stripeShipping = paymentIntent.shipping && paymentIntent.shipping.address ? paymentIntent.shipping.address : null;
    const shippingAddress = {
      line1: (stripeShipping && stripeShipping.line1) || validatedMetadata.addressLine1,
      line2: (stripeShipping && (stripeShipping.line2 || stripeShipping.recipient)) || validatedMetadata.addressLine2,
      city: (stripeShipping && (stripeShipping.city || stripeShipping.locality)) || validatedMetadata.city,
      state: (stripeShipping && stripeShipping.state) || validatedMetadata.state,
      postalCode: (stripeShipping && (stripeShipping.postal_code || stripeShipping.postalCode)) || validatedMetadata.postalCode,
      country: (stripeShipping && stripeShipping.country) || validatedMetadata.country
    };
    const orderId = paymentIntent.id; // ID único do Stripe
    // Usar items direto do metadata (sem enrichment)
    let items = [];
    try {
      items = JSON.parse(paymentIntent.metadata.items || '[]');
      // Warn if webhook received fewer items than what was originally in the cart.
      // This can happen when the items JSON was truncated to fit Stripe's 500-char metadata limit.
      const itemsCount = parseInt(paymentIntent.metadata.items_count || '0', 10);
      if (itemsCount > 0 && items.length < itemsCount) {
        logger.warn('items metadata was truncated — email will show partial item list', {
          orderId,
          itemsInMeta: items.length,
          itemsCount
        });
      }
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

    const customerEmail = (paymentIntent.metadata.customer_email || paymentIntent.receipt_email || 'no-email@electricink.ie').toLowerCase().trim();
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
      shippingAddress: shippingAddress,
      items: enrichedItems,
      shippingMethod: paymentIntent.metadata.shipping_method || 'standard',
      shippingCost_cents: shipping_cents,
      subtotal_cents: subtotal_cents,
      total_cents: paymentIntent.amount,
      // Backwards-compatible human-readable values (EUR)
      shippingCost: (shipping_cents / 100),
      subtotal: (subtotal_cents / 100),
      total: (paymentIntent.amount / 100),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMillis: Date.now(),
      paidAtMillis: Date.now(),
      source: 'webhook',
      webhookEventId: event.id
    };
    // Tentar criar document com ID específico (atomicidade)
    const orderRef = db.collection('orders').doc(orderId);
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Starting inventory-aware transaction', { orderId, refPath: orderRef.path });
    }

    // Fast path: save order without inventory checks
    let orderAlreadyExists = false;
    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (orderDoc.exists) {
        orderAlreadyExists = true;
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
      transaction.set(orderRef, cleanOrder);
    });
    if (orderAlreadyExists) {
      return { success: true, orderId, emailStatus: 'skipped_duplicate', requestId };
    }
    logger.info('Order created successfully in Firestore (inventory checks disabled)');

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

    // ═══════════════════════════════════════════════════════════════
    // SEND EMAILS (AWAITED) — run inline so webhook waits for completion
    // ═══════════════════════════════════════════════════════════════
    const emailLog = { orderId, requestId, timestamp: new Date().toISOString() };

    // CLIENT EMAIL
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Sending order confirmation', { orderId });
    }
    try {
      if (!resend) throw new Error('Resend not configured');

      let clientEmailHtml = clientTemplateHtml || '';
      if (!clientEmailHtml) {
        clientEmailHtml = `<html><body><p>Order #${orderId}</p></body></html>`;
      }

      // Compute VAT to display: prefer metadata.vat from PaymentIntent if present,
      // otherwise compute reverse-rate from stored subtotal (prices include VAT).
      const metadataVat = (paymentIntent.metadata && paymentIntent.metadata.vat && !isNaN(Number(paymentIntent.metadata.vat))) ? Number(paymentIntent.metadata.vat) : null;
      const computedClientVat = (metadataVat !== null) ? metadataVat : ((order.subtotal || 0) - ((order.subtotal || 0) / 1.23));
      const VAT_DISPLAY = (typeof computedClientVat === 'number' && !isNaN(computedClientVat)) ? computedClientVat.toFixed(2) : '0.00';

      clientEmailHtml = clientEmailHtml
        .replace(/{{orderNumber}}/g, orderId)
        .replace(/{{customerName}}/g, escapeHtml(order.customerName || ''))
        .replace(/{{customerEmail}}/g, escapeHtml(order.customerEmail || ''))
        .replace(/{{orderDate}}/g, new Date().toLocaleDateString())
        .replace(/{{shippingAddress}}/g, escapeHtml([
          order.shippingAddress?.line1,
          order.shippingAddress?.line2,
          order.shippingAddress?.city,
          order.shippingAddress?.postalCode,
          order.shippingAddress?.country
        ].filter(Boolean).join(', ')))
        .replace(/{{subtotal}}/g, ((order.subtotal || 0)).toFixed(2))
        .replace(/{{shippingCost}}/g, (order.shippingCost && order.shippingCost > 0) ? order.shippingCost.toFixed(2) : 'FREE')
        .replace(/{{total}}/g, ((order.total || 0)).toFixed(2))
        .replace(/{{vat}}/g, VAT_DISPLAY);

      // Carregar catálogo APENAS para email e criar versão enriquecida só para renderização
      const productCatalog = loadProductCatalog();

      // Heurística para resolver produto/variante a partir de ids que podem conter
      // prefixos duplicados (ex: "diluent-diluent-240ml") ou serem ids de variante.
      function resolveCatalogItem(itemId) {
        if (!itemId || typeof itemId !== 'string') return null;

        // exact product id
        let prod = productCatalog.find(p => p.id === itemId);
        if (prod) return { product: prod, variant: null };

        // variant exact match or priceId match
        for (const p of productCatalog) {
          if (p.variants && Array.isArray(p.variants)) {
            const v = p.variants.find(vv => vv.id === itemId || vv.priceId === itemId || vv.stripe_price_id === itemId);
            if (v) return { product: p, variant: v };
          }
        }

        // Remove duplicated prefix (e.g. "diluent-diluent-240ml" -> "diluent-240ml")
        const tokens = itemId.split('-');
        for (let k = 1; k <= Math.floor(tokens.length / 2); k++) {
          let repeated = true;
          for (let i = 0; i < k; i++) {
            if (tokens[i] !== tokens[i + k]) { repeated = false; break; }
          }
          if (repeated) {
            const candidate = tokens.slice(k).join('-');
            // product match
            const pmatch = productCatalog.find(p => p.id === candidate);
            if (pmatch) return { product: pmatch, variant: null };
            // variant match
            for (const p of productCatalog) {
              if (p.variants && Array.isArray(p.variants)) {
                const v = p.variants.find(vv => vv.id === candidate || vv.priceId === candidate || vv.stripe_price_id === candidate);
                if (v) return { product: p, variant: v };
              }
            }
          }
        }

        // Try suffix matching of last 1..3 tokens against variant ids
        for (let i = 1; i <= Math.min(3, tokens.length - 1); i++) {
          const suffix = tokens.slice(tokens.length - i).join('-');
          for (const p of productCatalog) {
            if (p.variants && p.variants.find(vv => vv.id === suffix)) {
              return { product: p, variant: p.variants.find(vv => vv.id === suffix) };
            }
          }
        }

        return null;
      }

      const itemsForEmail = (order.items || []).map(item => {
        const resolved = resolveCatalogItem(item.id);
        let name = item.name || item.id;
        let price = 0;
        if (resolved && resolved.product) {
          name = (resolved.product.name || resolved.product.title) || name;
          if (resolved.variant) {
            price = (typeof resolved.variant.price === 'number') ? Number(resolved.variant.price) : (resolved.product.basic && typeof resolved.product.basic.price === 'number' ? Number(resolved.product.basic.price) : (resolved.product.price !== undefined ? Number(resolved.product.price) : 0));
            // Prefer variant label if available
            if (resolved.variant.label) {
              name = `${name} - ${resolved.variant.label}`;
            }
          } else {
            price = (resolved.product.basic && typeof resolved.product.basic.price === 'number') ? Number(resolved.product.basic.price) : (resolved.product.price !== undefined ? Number(resolved.product.price) : 0);
          }
        } else {
          price = (item.price !== undefined ? Number(item.price) : 0);
        }

        return Object.assign({}, item, {
          name,
          price
        });
      });

      const itemsHtml = (itemsForEmail || []).map(item => {
        const unitRaw = (item.unit_amount !== undefined && item.unit_amount !== null)
          ? (item.unit_amount / 100)
          : (item.price !== undefined ? item.price : (item.amount_total !== undefined ? (item.amount_total / 100) : 0));
        const price = Number(unitRaw || 0);
        const quantity = item.quantity || 1;
        const lineTotal = (price * quantity) || 0;
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">
              <strong>${item.name || item.description || item.id || 'Item'}</strong>
              ${item.variant ? `<br><small style="font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 11px; color: #999999;">${String(item.variant).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</small>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">${quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">€${price.toFixed(2)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000; font-weight: 700;">€${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      // ── Black Cat Rewards block ───────────────────────────────────
      let pointsBlock = '';
      try {
        const _internalApiUrl = process.env.INTERNAL_API_URL;
        if (order.customerEmail && _internalApiUrl) {
          const ptsFetch = await fetch(
            `${_internalApiUrl}/api/loyalty/points-summary?email=${encodeURIComponent(order.customerEmail)}`
          );
          if (ptsFetch.ok) {
            const ptsData = await ptsFetch.json();
            if (ptsData.found && ptsData.points > 0) {
              const multipliers = { fresh_ink: 4, steady_hand: 5, raw_talent: 6, nine_lives: 7, legend: 8, black_cat: 10 };
              const lvl = ptsData?.level || 'fresh_ink';
              const earned = Math.round((order.total || 0) * (multipliers[lvl] || 4));
              const levelLabels = {
                fresh_ink:   'Fresh Ink',
                steady_hand: 'Steady Hand',
                raw_talent:  'Raw Talent',
                nine_lives:  'Nine Lives',
                legend:      'Legend',
                black_cat:   'Black Cat',
              };
              const levelLabel = levelLabels[ptsData.level] || ptsData.level;
              pointsBlock = `
              <tr>
                <td style="padding: 0 40px 0 40px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafb;border-radius:8px;margin-bottom:30px;">
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 4px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:#999999;text-transform:uppercase;letter-spacing:0.06em;">Black Cat Rewards</p>
                        <p style="margin:0 0 16px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#43BDAB;">+${earned.toLocaleString()} Catokens earned</p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td style="font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:13px;color:#666666;">Total balance</td>
                            <td align="right" style="font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#000000;">${ptsData.points.toLocaleString()} Catokens</td>
                          </tr>
                          <tr>
                            <td style="font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:13px;color:#666666;padding-top:6px;">Level</td>
                            <td align="right" style="font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#000000;padding-top:6px;">${levelLabel}</td>
                          </tr>
                        </table>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
                          <tr>
                            <td style="border-radius:4px;background-color:#000000;">
                              <a href="https://electricink.ie/account.html"
                                 style="display:inline-block;padding:10px 20px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">
                                View your rewards
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
            }
          }
        }
      } catch (ptsErr) {
        logger.warn('Points block fetch failed', { error: ptsErr.message });
      }
      // ─────────────────────────────────────────────────────────────

      const finalClientHtml = clientEmailHtml
        .replace(/{{itemsList}}/g, itemsHtml)
        .replace(/{{pointsBlock}}/g, pointsBlock);

      const clientResult = await resend.emails.send({
        from: EMAIL_FROM,
        to: order.customerEmail,
        subject: `Order Confirmation #${orderId} - Electric Ink Ireland`,
        html: finalClientHtml
      });

      logger.info('[CLIENT] Email sent successfully', { orderId, emailId: clientResult.id });

      if (db) {
        await db.collection('orders').doc(orderId).update({
          emailStatus: 'sent',
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailId: clientResult.id
        }).catch(err => {
          logger.error('[CLIENT] Failed to update Firestore', { orderId, error: err && err.message });
        });
      }
    } catch (clientErr) {
      logger.error('[CLIENT] Email failed', { orderId, error: clientErr && clientErr.message });
      if (db) {
        await db.collection('orders').doc(orderId).update({
          emailStatus: 'failed',
          emailError: clientErr?.message
        }).catch(err => {
          logger.error('[CLIENT] Failed to update error in Firestore', { orderId, error: err && err.message });
        });
      }
    }

    // ADMIN EMAIL
    if (process.env.NODE_ENV === 'development') {
      logger.debug('[ADMIN-EMAIL] Starting admin notification', { adminEmail: ADMIN_EMAIL });
    }
    try {
      if (!resend) throw new Error('Resend not configured');

      let adminEmailHtml = adminTemplateHtml || '';
      if (!adminEmailHtml) {
        adminEmailHtml = `<html><body><p>New order #${orderId}</p></body></html>`;
      }

      // Compute VAT for admin view: prefer metadata.vat then fallback to reverse-rate
      const metadataVatAdmin = (paymentIntent.metadata && paymentIntent.metadata.vat && !isNaN(Number(paymentIntent.metadata.vat))) ? Number(paymentIntent.metadata.vat) : null;
      const computedAdminVat = (metadataVatAdmin !== null) ? metadataVatAdmin : ((order.subtotal || 0) - ((order.subtotal || 0) / 1.23));
      const VAT_DISPLAY_ADMIN = (typeof computedAdminVat === 'number' && !isNaN(computedAdminVat)) ? computedAdminVat.toFixed(2) : '0.00';

      adminEmailHtml = adminEmailHtml
        .replace(/{{orderNumber}}/g, orderId)
        .replace(/{{customerName}}/g, escapeHtml(order.customerName || ''))
        .replace(/{{customerEmail}}/g, escapeHtml(order.customerEmail || ''))
        .replace(/{{customerPhone}}/g, order.customerPhone || 'N/A')
        .replace(/{{orderDate}}/g, new Date().toLocaleDateString())
        .replace(/{{shippingAddress}}/g, escapeHtml([
          order.shippingAddress?.line1,
          order.shippingAddress?.line2,
          order.shippingAddress?.city,
          order.shippingAddress?.postalCode,
          order.shippingAddress?.country
        ].filter(Boolean).join(', ')))
        .replace(/{{subtotal}}/g, ((order.subtotal || 0)).toFixed(2))
        .replace(/{{shippingCost}}/g, (order.shippingCost && order.shippingCost > 0) ? order.shippingCost.toFixed(2) : 'FREE')
        .replace(/{{total}}/g, ((order.total || 0)).toFixed(2))
        .replace(/{{vat}}/g, VAT_DISPLAY_ADMIN);

      // Carregar catálogo APENAS para email e criar versão enriquecida só para renderização (admin)
      const productCatalogForAdmin = PRODUCT_CATALOG_CACHE || loadProductCatalog();
      const itemsForEmailAdmin = (order.items || []).map(item => {
        const resolved = resolveCatalogItem(item.id);
        let name = item.name || item.id;
        let price = 0;
        if (resolved && resolved.product) {
          name = (resolved.product.name || resolved.product.title) || name;
          if (resolved.variant) {
            price = (typeof resolved.variant.price === 'number') ? Number(resolved.variant.price) : (resolved.product.basic && typeof resolved.product.basic.price === 'number' ? Number(resolved.product.basic.price) : (resolved.product.price !== undefined ? Number(resolved.product.price) : 0));
            if (resolved.variant.label) {
              name = `${name} - ${resolved.variant.label}`;
            }
          } else {
            price = (resolved.product.basic && typeof resolved.product.basic.price === 'number') ? Number(resolved.product.basic.price) : (resolved.product.price !== undefined ? Number(resolved.product.price) : 0);
          }
        } else {
          price = (item.price !== undefined ? Number(item.price) : 0);
        }
        return Object.assign({}, item, { name, price });
      });

      const adminItemsHtml = (itemsForEmailAdmin || []).map(item => {
        const unitRaw = (item.unit_amount !== undefined && item.unit_amount !== null)
          ? (item.unit_amount / 100)
          : (item.price !== undefined ? item.price : (item.amount_total !== undefined ? (item.amount_total / 100) : 0));
        const price = Number(unitRaw || 0);
        const quantity = item.quantity || 1;
        const lineTotal = (price * quantity) || 0;
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">
              <strong>${item.name || item.description || item.id || 'Item'}</strong>
              ${item.sku ? ` <small style="color:#999999">(SKU: ${item.sku})</small>` : ''}
              ${item.variant ? `<br><small style="font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 11px; color: #999999;">${String(item.variant).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</small>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">${quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">€${price.toFixed(2)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000; font-weight: 700;">€${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      const finalAdminHtml = adminEmailHtml.replace(/{{itemsList}}/g, adminItemsHtml);

      if (process.env.NODE_ENV === 'development') {
        logger.debug('[ADMIN-EMAIL] Sending to', { adminEmail: ADMIN_EMAIL });
      }
      const adminEmailResult = await resend.emails.send({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `🔔 New Order #${orderId} - ${order.customerName}`,
        html: finalAdminHtml
      });

      logger.info('[ADMIN-EMAIL] Sent successfully', { orderId, emailId: adminEmailResult.id });

      if (db) {
        await db.collection('orders').doc(orderId).update({
          adminEmailStatus: 'sent',
          adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          adminEmailId: adminEmailResult.id
        }).catch(err => {
          logger.error('[ADMIN-EMAIL] Failed to update Firestore', { orderId, error: err && err.message });
        });
      }
    } catch (adminErr) {
      logger.error('[ADMIN-EMAIL] Failed to send', { orderId, error: adminErr && adminErr.message });
      if (db) {
        await db.collection('orders').doc(orderId).update({
          adminEmailStatus: 'failed',
          adminEmailError: adminErr?.message,
          adminEmailErrorAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => {
          logger.error('[ADMIN-EMAIL] Failed to update Firestore error', { orderId, error: err && err.message });
        });
      }
    }

    if (process.env.NODE_ENV === 'development') {
      logger.debug('Both emails processed');
    }
    logger.info(JSON.stringify({
      msg: 'Order saved and emails processed',
      orderId,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'emails_processed'
    }));

    // Register sale in internal system (non-blocking)
    try {
      const internalApiUrl = process.env.INTERNAL_API_URL;
      const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET;
      if (internalApiUrl && internalSecret) {
        const salePayload = {
          shipping_address: order.shippingAddress || null,
          shipping_method: order.shippingMethod || null,
          customer_phone: order.customerPhone || null,

          items: enrichedItems.map(it => ({
            ...it,
            // price_ex = price excluding VAT. Site JSON prices include 23% VAT,
            // so divide by 1.23 to get the ex-VAT value the internal system expects.
            price_ex: (() => {
              const resolved = resolveCatalogItem(it.id);
              let grossPrice = 0;
              if (resolved && resolved.variant) {
                grossPrice = resolved.variant.price || resolved.product?.basic?.price || 0;
              } else if (resolved && resolved.product) {
                grossPrice = resolved.product.basic?.price || resolved.product.price || 0;
              }
              return grossPrice > 0 ? parseFloat((grossPrice / 1.23).toFixed(4)) : 0;
            })()
          })),
          total: order.total,
          order_id: order.orderId,
          customer_name: order.customerName,
          customer_email: order.customerEmail,
          referral_code: (paymentIntent.metadata && paymentIntent.metadata.referral_code)
            ? paymentIntent.metadata.referral_code
            : null
        };
        const saleRes = await fetch(`${internalApiUrl}/api/sales/website`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': internalSecret
          },
          body: JSON.stringify(salePayload)
        });
        if (!saleRes.ok) {
          logger.warn('Failed to register sale in internal system', { orderId, status: saleRes.status });
        } else {
          logger.info('Sale registered in internal system', { orderId });
        }
      }
    } catch (saleErr) {
      logger.error('Error registering sale in internal system', { orderId, error: saleErr && saleErr.message });
    }

    return { success: true, orderId, emailStatus: 'processed', requestId };

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
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
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
