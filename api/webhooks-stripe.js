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
  console.log('✅ Email templates loaded');
} catch (tplErr) {
  console.warn('⚠️ Email templates could not be loaded:', tplErr && tplErr.message);
}

// ===== ENV VARS VERIFICATION (STARTUP LOG) =====
console.log('🔧 [STARTUP] GitHub Inventory Config:', {
  enabled: process.env.ENABLE_GITHUB_INVENTORY,
  hasToken: !!process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || 'main'
});

if (process.env.ENABLE_GITHUB_INVENTORY === 'true' && !process.env.GITHUB_TOKEN) {
  console.error('❌ [STARTUP] ENABLE_GITHUB_INVENTORY is true but GITHUB_TOKEN is missing!');
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
        console.warn('⚠️ Failed to parse catalog file', f, e && e.message);
      }
    }
    PRODUCT_CATALOG_CACHE = catalog;
    return PRODUCT_CATALOG_CACHE;
  } catch (err) {
    console.error('❌ loadProductCatalog error:', err && err.message);
    return [];
  }
}

// Email configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'electricink.ie@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@electricink.ie';
// ═══════════════════════════════════════════════════════════
// INVENTORY CONFIGURATION
// ═══════════════════════════════════════════════════════════

  const INVENTORY_CONFIG = {
    OBSERVATION_MODE: true, // Set false to enable blocking behavior
    ENABLE_INVENTORY_CHECK: false, // Toggle inventory checks entirely (DISABLED - using GitHub decrements)
    SEND_LOW_STOCK_ALERTS: true // Send low-stock alerts (logs/emails)
  };

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

// ===== GITHUB INVENTORY DECREMENT SYSTEM =====
const GITHUB_INVENTORY_CONFIG = {
  ENABLED: false, // ← DESATIVADO PERMANENTEMENTE
  OWNER: process.env.GITHUB_OWNER,
  REPO: process.env.GITHUB_REPO,
  TOKEN: process.env.GITHUB_TOKEN,
  BRANCH: process.env.GITHUB_BRANCH || 'main'
};

async function decrementInventoryViaGitHub(items) {
  if (!GITHUB_INVENTORY_CONFIG.ENABLED) {
    console.log('ℹ️ GitHub inventory decrement disabled');
    return { success: false, reason: 'disabled' };
  }

  if (!GITHUB_INVENTORY_CONFIG.TOKEN) {
    console.error('❌ GITHUB_TOKEN not configured');
    return { success: false, reason: 'no_token' };
  }

  try {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: GITHUB_INVENTORY_CONFIG.TOKEN });

    const owner = GITHUB_INVENTORY_CONFIG.OWNER;
    const repo = GITHUB_INVENTORY_CONFIG.REPO;
    const path = 'data/decrements.json';
    const branch = GITHUB_INVENTORY_CONFIG.BRANCH;

    let decrements = {};
    let sha = null;

    console.log('🔍 [DECREMENT] Starting GitHub inventory update', {
      itemsCount: (items || []).length,
      items: (items || []).map(i => ({ id: i.v || i.id, qty: i.q || i.quantity || 1 }))
    });

    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
      const content = Buffer.from(data.content, 'base64').toString('utf8');
      decrements = JSON.parse(content);
      sha = data.sha;
      console.log('✅ Current decrements loaded from GitHub');
    } catch (error) {
      if (error.status === 404) {
        console.log('ℹ️ decrements.json not found, will create new one');
        decrements = {};
      } else {
        throw error;
      }
    }

    for (const item of items) {
      const variantId = item.v || item.id;
      const quantity = item.q || item.quantity || 1;
      decrements[variantId] = (decrements[variantId] || 0) + quantity;
      console.log(`📦 Decrementing ${variantId}: +${quantity} sold`);
    }

    const newContent = JSON.stringify(decrements, null, 2);
    let encodedContent = Buffer.from(newContent).toString('base64');

    const commitData = {
      owner,
      repo,
      path,
      message: `chore(inventory): auto-decrement after order`,
      content: encodedContent,
      branch
    };

    if (sha) commitData.sha = sha;

    // ===== RETRY LOGIC FOR CONFLICT RESOLUTION =====
    let commitSuccess = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!commitSuccess && retryCount < maxRetries) {
      console.log('🔍 [DECREMENT] Attempting commit', {
        retry: retryCount,
        currentSHA: sha ? String(sha).substring(0, 7) : 'none',
        variantsToUpdate: Object.keys(decrements)
      });
      try {
        if (retryCount > 0) {
          console.log(`🔄 Retry ${retryCount}/${maxRetries} - refetching latest decrements`);
          try {
            const { data: latestData } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
            const latestContent = Buffer.from(latestData.content, 'base64').toString('utf8');
            const latestParsed = latestContent ? JSON.parse(latestContent) : {};
            // Replace local decrements with latest and re-apply increments
            decrements = latestParsed || {};
            sha = latestData.sha;

            for (const item of items) {
              const variantId = item.v || item.id;
              const quantity = item.q || item.quantity || 1;
              decrements[variantId] = (decrements[variantId] || 0) + quantity;
              console.log(`📦 (retry) Decrementing ${variantId}: +${quantity} sold`);
            }

            const refreshedContent = JSON.stringify(decrements, null, 2);
            encodedContent = Buffer.from(refreshedContent).toString('base64');
            commitData.content = encodedContent;
            commitData.sha = sha;
          } catch (refetchError) {
            console.error('❌ Refetch failed during retry:', refetchError && refetchError.message);
            throw refetchError;
          }
        }

        // Attempt commit
        await octokit.repos.createOrUpdateFileContents(commitData);

        commitSuccess = true;
        console.log('✅ [DECREMENT] Commit successful', {
          retry: retryCount,
          newDecrements: decrements,
          itemsProcessed: items.length
        });
      } catch (error) {
        retryCount++;

        const isConflict = error && (error.status === 409 || error.status === 422 || (error.message && error.message.includes('does not match')));

        if (isConflict && retryCount < maxRetries) {
          console.warn(`⚠️ SHA conflict detected, will retry (${retryCount}/${maxRetries})`);
          // Small exponential-ish backoff
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          continue;
        } else {
          console.error('❌ GitHub inventory decrement failed:', error && error.message);
          if (error && error.response) {
            console.error('GitHub API Error:', { status: error.response.status, data: error.response.data });
          }
          return { success: false, error: error && error.message };
        }
      }
    }

    if (!commitSuccess) {
      console.error('❌ Failed to commit decrements after retries');
      return { success: false, error: 'max_retries_exceeded' };
    }

    return { success: true, decrements, itemsProcessed: items.length };
  } catch (error) {
    console.error('❌ GitHub inventory decrement failed:', error && error.message);
    if (error && error.response) {
      console.error('GitHub API Error:', { status: error.response.status, data: error.response.data });
    }
    return { success: false, error: error && error.message };
  }
}
// ===== FIM GITHUB INVENTORY SYSTEM =====



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
    console.warn('[WEBHOOK] RESEND_API_KEY not configured - emails will be skipped');
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
    console.error('❌ STRIPE_WEBHOOK_SECRET não configurado');
    return res.status(500).json({ error: 'Webhook secret not configured', requestId });
  }

  // Validate Resend (non-blocking)
  try {
    const configCheck = await validateResendConfig();
    if (!configCheck?.valid) {
      console.warn('[RESEND-CONFIG] Validation warning:', configCheck);
    } else {
      console.log('[RESEND-CONFIG] Validation:', configCheck);
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ [DEV] Webhook event:', event.type, 'ID:', event.id);
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
        // Security: require backend validation flag set when PaymentIntent was created
        try {
          const paymentIntent = event.data && event.data.object ? event.data.object : null;
          if (!paymentIntent || !(paymentIntent.metadata && paymentIntent.metadata.backend_validated === 'true')) {
            console.error('❌ Webhook rejected: metadata not validated', {
              paymentIntentIdLast4: paymentIntent && paymentIntent.id ? String(paymentIntent.id).slice(-4) : null,
              requestId
            });
            return res.status(400).json({ error: 'Invalid metadata - backend validation missing', requestId });
          }
          console.log('✅ Metadata validated by backend', { paymentIntentIdLast4: String(paymentIntent.id).slice(-4) });
        } catch (e) {
          console.error('❌ Error checking backend_validated flag:', e && e.message);
          return res.status(400).json({ error: 'Invalid metadata - backend validation check failed', requestId });
        }

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
// ═══════════════════════════════════════════════════════════
// INVENTORY MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get inventory doc ID from cart item
 * Prefers variant ID, falls back to product ID
 */
function getInventoryDocId(item) {
  // item structure: { id: productId, v: variantId, q: quantity }
  // Variant ID takes priority (for products with variants)
  const docId = item.v || item.id;
  return docId;
}

/**
 * Check if sufficient inventory exists for all items
 * DOES NOT MODIFY - read-only check
 */
async function checkInventoryAvailability(items, transaction) {
  const results = [];
  for (const item of items) {
    const docId = getInventoryDocId(item);
    const quantity = item.q || item.quantity || 1;
    try {
      const inventoryRef = admin.firestore().collection('inventory').doc(docId);
      const inventoryDoc = await transaction.get(inventoryRef);
      if (!inventoryDoc.exists) {
        console.warn(`⚠️  Inventory doc not found: ${docId}`);
        results.push({
          docId,
          requested: quantity,
          available: null,
          sufficient: false,
          reason: 'inventory_doc_not_found'
        });
        continue;
      }
      const inventoryData = inventoryDoc.data();
      const available = inventoryData.quantity || 0;
      const sufficient = available >= quantity;
      results.push({
        docId,
        productName: inventoryData.productName,
        variantLabel: inventoryData.variantLabel,
        requested: quantity,
        available,
        sufficient,
        reason: sufficient ? 'ok' : 'insufficient_stock'
      });
    } catch (error) {
      console.error(`❌ Error checking inventory for ${docId}:`, error);
      results.push({
        docId,
        requested: quantity,
        available: null,
        sufficient: false,
        reason: 'error_checking_inventory'
      });
    }
  }
  return results;
}

/**
 * Decrement inventory for all items
 * Uses Firestore transaction for atomicity
 */
async function decrementInventory(items, transaction) {
  const results = [];
  for (const item of items) {
    const docId = getInventoryDocId(item);
    const quantity = item.q || item.quantity || 1;
    try {
      const inventoryRef = admin.firestore().collection('inventory').doc(docId);
      const inventoryDoc = await transaction.get(inventoryRef);
      if (!inventoryDoc.exists) {
        console.warn(`⚠️  Cannot decrement - doc not found: ${docId}`);
        results.push({
          docId,
          success: false,
          reason: 'doc_not_found'
        });
        continue;
      }
      const inventoryData = inventoryDoc.data();
      const currentQty = inventoryData.quantity || 0;
      const newQty = Math.max(0, currentQty - quantity);
      // Update quantity
      transaction.update(inventoryRef, {
        quantity: newQty,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        lastDecrementedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastDecrementedBy: 'webhook_payment_success'
      });
      results.push({
        docId,
        productName: inventoryData.productName,
        previousQty: currentQty,
        decremented: quantity,
        newQty,
        success: true
      });
      console.log(`✅ Decremented ${docId}: ${currentQty} → ${newQty}`);
    } catch (error) {
      console.error(`❌ Error decrementing inventory for ${docId}:`, error);
      results.push({
        docId,
        success: false,
        reason: 'error_during_decrement',
        error: error.message
      });
    }
  }
  return results;
}

/**
 * Send email/log notification when stock insufficient
 * OBSERVATION MODE: Alerts admin without blocking order
 */
async function sendLowStockAlert(checkResults, orderData) {
  const insufficientItems = checkResults.filter(r => !r.sufficient);
  if (insufficientItems.length === 0) return;
  console.warn('⚠️  LOW STOCK ALERT - Order would be blocked in production:');
  console.warn(JSON.stringify(insufficientItems, null, 2));
  const alertMessage = `\n🚨 LOW STOCK ALERT - OBSERVATION MODE\n\nOrder ID: ${orderData.orderId || 'unknown'}\nCustomer: ${orderData.customerEmail || 'unknown'}\n\nItems with insufficient stock:\n${insufficientItems.map(item => `- ${item.productName || item.docId}${item.variantLabel ? ' (' + item.variantLabel + ')' : ''}\n   Requested: ${item.requested}, Available: ${item.available}, Reason: ${item.reason}`).join('\n')}\n\n⚠️  NOTE: Order was ACCEPTED in observation mode.\nIn production mode, this order would be BLOCKED.\n\nAction required: Restock or manually handle order.\n  `;
  console.log(alertMessage);
  // TODO: hook into email service when ready (Resend)
  if (INVENTORY_CONFIG.SEND_LOW_STOCK_ALERTS && resend) {
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `🚨 LOW STOCK ALERT - Order ${orderData.orderId || 'unknown'}`,
        html: `<pre>${alertMessage}</pre>`
      });
      console.log('✅ Low stock alert email sent');
    } catch (err) {
      console.error('⚠️ Failed to send low stock alert email:', err && err.message);
    }
  }
}
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
      shippingAddress: shippingAddress,
      items: enrichedItems,
      shippingMethod: paymentIntent.metadata.shippingMethod || null,
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
    console.log('🔍 Iniciando inventory-aware transaction para order:', orderId);
    console.log('🔍 Order ref path:', orderRef.path);

    if (!INVENTORY_CONFIG.ENABLE_INVENTORY_CHECK) {
      // Fast path: no inventory checks, preserve previous behavior
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
        transaction.set(orderRef, cleanOrder);
      });
      console.log('✅ Order criada com sucesso no Firestore (inventory checks disabled)');
    } else {
      // ===== FIRESTORE INVENTORY (DESABILITADO) =====
      // Firestore-based inventory checks and decrements are disabled.
      // Inventory is now managed via GitHub `data/decrements.json` (decrementInventoryViaGitHub).
      // The original transaction-based inventory-check/decrement logic is preserved in the
      // repository history and in the functions `checkInventoryAvailability` and `decrementInventory`.
      // To keep behavior explicit and non-executing, the Firestore inventory branch is intentionally
      // commented out below for future reference.

      // if (INVENTORY_CONFIG.ENABLE_INVENTORY_CHECK) {
      //   try {
      //     await db.runTransaction(async (transaction) => {
      //       // original inventory-check & decrement logic (commented)
      //     });
      //   } catch (txErr) {
      //     // original error handling (commented)
      //   }
      // }

      // ===== FIM FIRESTORE INVENTORY =====
    }

    // 5. Envia email de confirmação (NÃO-BLOQUEANTE) após salvar pedido
    // ===== AUTO-DECREMENT INVENTORY VIA GITHUB =====
      try {
      // Use parsed items from metadata if available
      const itemsToDecrement = items || JSON.parse(paymentIntent.metadata.items || '[]');

      // DEBUG: log items payload before attempting GitHub decrement
      console.log('🔍 [DEBUG] Items to decrement:', JSON.stringify(itemsToDecrement || [], null, 2));

      if (itemsToDecrement && itemsToDecrement.length > 0) {
        console.log(`🔄 Attempting to decrement inventory for ${itemsToDecrement.length} items`);

        // DEBUG: pre-call GitHub inventory config check
        console.log('🔍 [DEBUG] Pre-GitHub decrement check:', {
          enabled: GITHUB_INVENTORY_CONFIG.ENABLED,
          hasToken: !!GITHUB_INVENTORY_CONFIG.TOKEN,
          owner: GITHUB_INVENTORY_CONFIG.OWNER,
          repo: GITHUB_INVENTORY_CONFIG.REPO,
          itemsCount: itemsToDecrement?.length
        });

        const result = await decrementInventoryViaGitHub(itemsToDecrement);

        // DEBUG: post-call result
        console.log('🔍 [DEBUG] GitHub decrement result:', {
          success: result?.success,
          reason: result?.reason,
          error: result?.error,
          hasDecrements: !!result?.decrements
        });

        if (result && result.success) {
          console.log('✅ Inventory successfully decremented via GitHub');
          console.log('📊 Decrements updated:', result.decrements);
        } else {
          console.warn('⚠️ Inventory decrement skipped:', result && (result.reason || result.error));
        }
      }
    } catch (error) {
      console.error('❌ Inventory decrement error (non-critical):', error && error.message);
      console.error('Stack:', error && error.stack);
      if (typeof captureException === 'function') {
        captureException(error, {
          extra: { context: 'inventory_decrement', paymentIntentId: paymentIntent.id }
        });
      }
    }
    // ===== FIM AUTO-DECREMENT =====
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
      console.log('📧 [DEV] Sending order confirmation', { orderId });
    } else {
      console.log('📧 Order confirmation sent', { orderId });
    }
    try {
      if (!resend) throw new Error('Resend not configured');

      let clientEmailHtml = clientTemplateHtml || '';
      if (!clientEmailHtml) {
        clientEmailHtml = `<html><body><p>Order #${orderId}</p></body></html>`;
      }

      clientEmailHtml = clientEmailHtml
        .replace(/{{orderNumber}}/g, orderId)
        .replace(/{{customerName}}/g, order.customerName || '')
        .replace(/{{customerEmail}}/g, order.customerEmail || '')
        .replace(/{{orderDate}}/g, new Date().toLocaleDateString())
        .replace(/{{shippingAddress}}/g, `${order.shippingAddress?.line1 || ''}${order.shippingAddress?.line2 ? '<br>' + order.shippingAddress.line2 : ''}<br>${order.shippingAddress?.city || ''}${order.shippingAddress?.postalCode ? ', ' + order.shippingAddress.postalCode : ''}<br>${order.shippingAddress?.country || ''}`)
        .replace(/{{subtotal}}/g, ((order.subtotal || 0)).toFixed(2))
        .replace(/{{shippingCost}}/g, (order.shippingCost && order.shippingCost > 0) ? order.shippingCost.toFixed(2) : 'FREE')
        .replace(/{{total}}/g, ((order.total || 0)).toFixed(2))
        .replace(/{{vat}}/g, (((order.total || 0) - (order.subtotal || 0) - (order.shippingCost || 0)) || 0).toFixed(2));

      // Carregar catálogo APENAS para email e criar versão enriquecida só para renderização
      const productCatalog = loadProductCatalog();
      const itemsForEmail = (order.items || []).map(item => {
        const product = productCatalog.find(p => p.id === item.id);
        return Object.assign({}, item, {
          name: (product && (product.name || product.title)) ? (product.name || product.title) : (item.name || item.id),
          price: (product && (product.price !== undefined && product.price !== null)) ? Number(product.price) : (item.price !== undefined ? Number(item.price) : 0)
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
              ${item.variant ? `<br><small style="font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 11px; color: #999999;">${item.variant}</small>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">${quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">€${price.toFixed(2)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000; font-weight: 700;">€${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      const finalClientHtml = clientEmailHtml.replace(/{{itemsList}}/g, itemsHtml);

      const clientResult = await resend.emails.send({
        from: EMAIL_FROM,
        to: order.customerEmail,
        subject: `Order Confirmation #${orderId} - Electric Ink Ireland`,
        html: finalClientHtml
      });

      console.log('✅ [CLIENT] Email sent successfully! ID:', clientResult.id);

      if (db) {
        await db.collection('orders').doc(orderId).update({
          emailStatus: 'sent',
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailId: clientResult.id
        }).catch(err => {
          console.error('⚠️ [CLIENT] Failed to update Firestore:', err);
        });
      }
    } catch (clientErr) {
      console.error('❌ [CLIENT] Email failed:', clientErr);
      if (db) {
        await db.collection('orders').doc(orderId).update({
          emailStatus: 'failed',
          emailError: clientErr?.message
        }).catch(err => {
          console.error('⚠️ [CLIENT] Failed to update error in Firestore:', err);
        });
      }
    }

    // ADMIN EMAIL
    console.log('📧 [ADMIN-EMAIL] Starting admin notification');
    console.log('📧 [ADMIN] Sending notification to (alias):', ADMIN_EMAIL);
    try {
      if (!resend) throw new Error('Resend not configured');

      let adminEmailHtml = adminTemplateHtml || '';
      if (!adminEmailHtml) {
        adminEmailHtml = `<html><body><p>New order #${orderId}</p></body></html>`;
      }

      adminEmailHtml = adminEmailHtml
        .replace(/{{orderNumber}}/g, orderId)
        .replace(/{{customerName}}/g, order.customerName || '')
        .replace(/{{customerEmail}}/g, order.customerEmail || '')
        .replace(/{{customerPhone}}/g, order.customerPhone || 'N/A')
        .replace(/{{orderDate}}/g, new Date().toLocaleDateString())
        .replace(/{{shippingAddress}}/g, `${order.shippingAddress?.line1 || ''}${order.shippingAddress?.line2 ? '<br>' + order.shippingAddress.line2 : ''}<br>${order.shippingAddress?.city || ''}${order.shippingAddress?.postalCode ? ', ' + order.shippingAddress.postalCode : ''}<br>${order.shippingAddress?.country || ''}`)
        .replace(/{{subtotal}}/g, ((order.subtotal || 0)).toFixed(2))
        .replace(/{{shippingCost}}/g, (order.shippingCost && order.shippingCost > 0) ? order.shippingCost.toFixed(2) : 'FREE')
        .replace(/{{total}}/g, ((order.total || 0)).toFixed(2))
        .replace(/{{vat}}/g, (((order.total || 0) - (order.subtotal || 0) - (order.shippingCost || 0)) || 0).toFixed(2));

      // Carregar catálogo APENAS para email e criar versão enriquecida só para renderização (admin)
      const productCatalogForAdmin = PRODUCT_CATALOG_CACHE || loadProductCatalog();
      const itemsForEmailAdmin = (order.items || []).map(item => {
        const product = productCatalogForAdmin.find(p => p.id === item.id);
        return Object.assign({}, item, {
          name: (product && (product.name || product.title)) ? (product.name || product.title) : (item.name || item.id),
          price: (product && (product.price !== undefined && product.price !== null)) ? Number(product.price) : (item.price !== undefined ? Number(item.price) : 0)
        });
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
              ${item.variant ? `<br><small style="font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 11px; color: #999999;">${item.variant}</small>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">${quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">€${price.toFixed(2)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000; font-weight: 700;">€${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      const finalAdminHtml = adminEmailHtml.replace(/{{itemsList}}/g, adminItemsHtml);

      console.log('📧 [ADMIN-EMAIL] Sending to:', ADMIN_EMAIL);
      const adminEmailResult = await resend.emails.send({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `🔔 New Order #${orderId} - ${order.customerName}`,
        html: finalAdminHtml
      });

      console.log('✅ [ADMIN-EMAIL] Sent successfully! Email ID:', adminEmailResult.id);

      if (db) {
        await db.collection('orders').doc(orderId).update({
          adminEmailStatus: 'sent',
          adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          adminEmailId: adminEmailResult.id
        }).catch(err => {
          console.error('⚠️ [ADMIN-EMAIL] Failed to update Firestore:', err);
        });
      }
    } catch (adminErr) {
      console.error('❌ [ADMIN-EMAIL] Failed to send:', adminErr);
      if (db) {
        await db.collection('orders').doc(orderId).update({
          adminEmailStatus: 'failed',
          adminEmailError: adminErr?.message,
          adminEmailErrorAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => {
          console.error('⚠️ [ADMIN-EMAIL] Failed to update Firestore error:', err);
        });
      }
    }

    console.log('📧 Both emails processed');
    logger.info(JSON.stringify({
      msg: 'Order saved and emails processed',
      orderId,
      requestId,
      timestamp: new Date().toISOString(),
      status: 'emails_processed'
    }));

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
