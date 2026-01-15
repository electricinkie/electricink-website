const fs = require('fs');
const path = require('path');
const { captureException } = require('../lib/sentry');
const { initResend, getResend, isResendConfigured } = require('../lib/resend');

// Initialize resend wrapper and get client (may be null)
initResend();
let resend = getResend();

const EMAIL_FROM = process.env.EMAIL_FROM || 'Electric Ink <orders@electricink.ie>';
const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://electricink.ie';

const CARRIER_NAMES = {
  'anpost': 'An Post',
  'dpd': 'DPD Ireland',
  'fastway': 'Fastway Couriers',
  'ups': 'UPS',
  'dhl': 'DHL Express',
  'custom': 'Courier'
};

// ────────── Helper: Load Template ──────────
function loadTemplate(templateName) {
  try {
    const templatePath = path.join(process.cwd(), 'email-templates', `${templateName}.html`);
    return fs.readFileSync(templatePath, 'utf8');
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    throw new Error(`Template ${templateName} not found`);
  }
}

// ────────── Helper: Format Address ──────────
function formatShippingAddress(shipping) {
  if (!shipping) return 'N/A';
  
  const parts = [];
  if (shipping.firstName || shipping.lastName) {
    parts.push(`${shipping.firstName || ''} ${shipping.lastName || ''}`.trim());
  }
  if (shipping.line1 || shipping.address) parts.push(shipping.line1 || shipping.address);
  if (shipping.line2 || shipping.address2) parts.push(shipping.line2 || shipping.address2);
  if (shipping.city) parts.push(shipping.city);
  if (shipping.postalCode || shipping.postal_code) parts.push(shipping.postalCode || shipping.postal_code);
  if (shipping.country) parts.push(shipping.country);
  if (shipping.phone) parts.push(`Tel: ${shipping.phone}`);
  
  return parts.filter(Boolean).join('<br>') || 'N/A';
}

// ────────── Helper: Format Date ──────────
function formatDate(dateInput) {
  if (!dateInput) return 'TBD';
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'TBD';
    
    return date.toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {
    console.warn('Date formatting error:', e);
    return String(dateInput);
  }
}

// ────────── Helper: Format Order Items Table ──────────
function formatOrderItemsTable(items) {
  if (!items || !items.length) return '<tr><td colspan="3">No items</td></tr>';
  
  return items.map(item => `
    <tr style="border-bottom: 1px solid #e8e8e8;">
      <td style="padding: 12px; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 14px; color: #000000;">
        ${item.name || item.id || 'Product'}
      </td>
      <td style="padding: 12px; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 14px; color: #000000;">
        x${item.quantity || 1}
      </td>
      <td style="padding: 12px; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 14px; color: #000000;">
        €${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
      </td>
    </tr>
  `).join('');
}

// ────────── Helper: Enrich Items (like send-order-email.js) ──────────
function enrichItems(items) {
  let products = {};
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const obj = require(path.join(dataDir, file));
        if (obj && typeof obj === 'object') products = { ...products, ...obj };
      } catch (e) {
        console.warn('Failed to load product data file', file);
      }
    }
  } catch (e) {
    console.warn('Failed to read data directory for enrichItems:', e && e.message);
  }
  
  return (items || []).map(item => {
    const product = products[item.id] || {};
    let variant = null;
    if (item.variant && Array.isArray(product.variants)) {
      variant = product.variants.find(v => 
        v.id === item.variant || 
        v.priceId === item.variant || 
        v.stripe_price_id === item.variant
      );
    }
    return {
      id: item.id,
      name: product.name || item.name || item.id,
      variant: variant ? (variant.label || variant.size || variant.id) : (item.variant || null),
      price: variant && typeof variant.price === 'number' ? variant.price : (typeof product.price === 'number' ? product.price : item.price || 0),
      quantity: item.quantity || 1
    };
  });
}

// ────────── Helper: Replace Placeholders ──────────
function replacePlaceholders(template, data) {
  let result = template;
  Object.keys(data).forEach(key => {
    const placeholder = `{{${key}}}`;
    const value = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  });
  return result;
}

// ────────── Main Handler ──────────
module.exports = async function handler(req, res) {
  // Debug: incoming request
  console.log('[SHIPPING-NOTIFICATION] 📧 Request received:', {
    method: req.method,
    bodyKeys: req.body ? Object.keys(req.body) : 'no body',
    hasResendKey: !!process.env.RESEND_API_KEY
  });

  // Check Resend initialization
  if (!resend) {
    console.error('[SHIPPING-NOTIFICATION] Resend not initialized');
    return res.status(503).json({ 
      error: 'Email service unavailable',
      reason: 'RESEND_API_KEY not configured' 
    });
  }

  // CORS (match send-order-email.js pattern)
  const ALLOWED_ORIGINS = [
    'https://electricink-website.vercel.app',
    publicBaseUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const origin = req.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require Authorization: Bearer <Firebase ID token>
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader || '').match(/^Bearer (.+)$/i);
  if (!match) return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  const idToken = match[1];

  // Verify token and ensure requester is admin (either claim or admins/{uid})
  try {
    const { getFirestore, admin } = require('../lib/firebase-admin');
    const db = getFirestore();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded && decoded.uid;
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    // Check admin claim first, fallback to admins collection
    const isAdminClaim = !!decoded.admin;
    if (!isAdminClaim) {
      const adminSnap = await db.collection('admins').doc(uid).get();
      if (!adminSnap.exists) return res.status(403).json({ error: 'Forbidden: admin required' });
    }
  } catch (err) {
    console.error('[SHIPPING-NOTIFICATION] Auth verification failed:', err && err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { orderId, carrier, trackingNumber, trackingUrl, estimatedDelivery } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    // Load order data from Firestore
    const { getFirestore, admin } = require('../lib/firebase-admin');
    const db = getFirestore();
    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderDoc.data();

    // Merge request data with stored order (request data takes precedence)
    const mergedData = {
      carrier: carrier || order.carrier || '',
      trackingNumber: trackingNumber || order.trackingNumber || '',
      trackingUrl: trackingUrl || order.trackingUrl || '',
      estimatedDelivery: estimatedDelivery || order.estimatedDelivery || null
    };

    // Load template
    const template = loadTemplate('order-shipped');

    // Enrich items (get product names, images, etc)
    const enrichedItems = enrichItems(order.items || []);

    // Format items as HTML table
    const orderItemsTableHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e8e8e8; border-radius: 8px;">
        <thead>
          <tr style="background-color: #f8f8f8;">
            <th style="padding: 12px; text-align: left; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; color: #666666;">Product</th>
            <th style="padding: 12px; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; color: #666666;">Qty</th>
            <th style="padding: 12px; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; color: #666666;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${formatOrderItemsTable(enrichedItems)}
        </tbody>
      </table>
    `;

    // Calculate financials (VAT is 23% included in total)
    const total = Number(order.total || 0);
    const vat = total * 0.23 / 1.23;
    const subtotal = total - vat;
    const shippingCost = order.shippingCost || 0;

    // Format shipping address
    const shippingAddress = formatShippingAddress(order.shippingAddress || order.shipping);

    // Build placeholder data
    const placeholderData = {
      ORDER_NUMBER: orderId,
      CUSTOMER_NAME: order.customerName || order.customerEmail || 'Customer',
      CARRIER: CARRIER_NAMES[mergedData.carrier] || mergedData.carrier || 'Courier',
      TRACKING_NUMBER: mergedData.trackingNumber,
      TRACKING_URL: mergedData.trackingUrl || '#',
      ESTIMATED_DELIVERY: formatDate(mergedData.estimatedDelivery),
      ORDER_ITEMS: orderItemsTableHtml,
      SUBTOTAL: subtotal.toFixed(2),
      SHIPPING: shippingCost === 0 || shippingCost === 'FREE' ? 'FREE' : shippingCost.toFixed(2),
      VAT: vat.toFixed(2),
      TOTAL: total.toFixed(2),
      SHIPPING_ADDRESS: shippingAddress
    };

    // Replace all placeholders
    const html = replacePlaceholders(template, placeholderData);

    // 🔧 FIX: Validate customer email and template before sending
    const customerEmail = order.customerEmail || order.userEmail || order.email;
    if (!customerEmail) {
      console.error('[SHIPPING-NOTIFICATION] ❌ No customer email found in order:', { orderId, orderKeys: Object.keys(order) });
      return res.status(400).json({ error: 'Customer email not found in order', hint: 'Order document is missing customerEmail field' });
    }

    // Simple email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      console.error('[SHIPPING-NOTIFICATION] ❌ Invalid customer email format:', customerEmail);
      return res.status(400).json({ error: 'Invalid customer email format', email: customerEmail });
    }

    // Validate template HTML
    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      console.error('[SHIPPING-NOTIFICATION] ❌ Email template is empty for order:', orderId);
      return res.status(500).json({ error: 'Email template is empty' });
    }

    // Prepare safe email payload
    const emailData = {
      from: EMAIL_FROM || 'Electric Ink <orders@electricink.ie>',
      to: customerEmail,
      subject: `Your Order #${orderId} Has Shipped!`,
      html: html,
      tags: [
        { name: 'type', value: 'shipping-notification' },
        { name: 'orderId', value: orderId }
      ]
    };

    console.log('[SHIPPING-NOTIFICATION] 📧 Prepared email data:', { from: emailData.from, to: emailData.to, subject: emailData.subject, htmlLength: emailData.html.length });

    // Ensure mandatory fields exist
    if (!emailData.from || !emailData.to || !emailData.subject || !emailData.html) {
      console.error('[SHIPPING-NOTIFICATION] ❌ Missing required email fields', {
        hasFrom: !!emailData.from,
        hasTo: !!emailData.to,
        hasSubject: !!emailData.subject,
        hasHtml: !!emailData.html
      });
      return res.status(500).json({ error: 'Email data incomplete', missing: [ !emailData.from && 'from', !emailData.to && 'to', !emailData.subject && 'subject', !emailData.html && 'html' ].filter(Boolean) });
    }

    // Try sending via Resend with robust error handling
    let result;
    try {
      console.log('[SHIPPING-NOTIFICATION] 📤 Calling resend.emails.send()...');
      result = await resend.emails.send(emailData);
      console.log('[SHIPPING-NOTIFICATION] ✅ Resend returned:', result && (result.id || result.data?.id || '(no id)'));
    } catch (sendError) {
      console.error('[SHIPPING-NOTIFICATION] ❌ Resend.send() failed:', {
        message: sendError && sendError.message,
        name: sendError && sendError.name,
        stack: sendError && sendError.stack,
        statusCode: sendError && sendError.statusCode
      });

      return res.status(500).json({
        error: 'Resend API error: ' + (sendError && sendError.message),
        hint: sendError && sendError.statusCode === 401 ? 'Invalid RESEND_API_KEY' : (sendError && sendError.statusCode === 422 ? 'Check from/to email addresses are valid' : 'Check server logs for full error details'),
        debug: { name: sendError && sendError.name, statusCode: sendError && sendError.statusCode }
      });
    }

    // Update Firestore with email status
    try {
      await db.collection('orders').doc(orderId).update({
        shippedEmailSent: true,
        shippedEmailSentAt: admin.firestore.Timestamp.now(),
        shippedEmailId: result && (result.id || result.data?.id || null)
      });
    } catch (e) {
      console.warn('[SHIPPING-NOTIFICATION] ⚠️ Failed to update order email status:', e && e.message);
    }

    console.log(`✅ [SHIPPING-NOTIFICATION] Sent for order ${orderId} to ${customerEmail}`, result && (result.id || result.data?.id));

    return res.status(200).json({
      success: true,
      messageId: result && (result.id || result.data?.id || null)
    });

  } catch (error) {
    captureException(error, {
      endpoint: 'send-shipping-notification',
      context: { orderId: req.body?.orderId }
    });

    console.error('❌ [SHIPPING-NOTIFICATION] Error:', error.message);

    return res.status(500).json({ 
      error: 'Failed to send shipping notification',
      message: error.message 
    });
  }
};
