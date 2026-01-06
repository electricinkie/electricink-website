const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const resend = new Resend(process.env.RESEND_API_KEY);
const { captureException } = require('./lib/sentry');

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

// ────────── Helper: Replace Placeholders ──────────
function replacePlaceholders(template, data) {
  let result = template;
  
  // Simple placeholders
  Object.keys(data).forEach(key => {
    const placeholder = `{{${key}}}`;
    const value = data[key] || '';
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });
  
  return result;
}

// ────────── Helper: Format Order Items HTML ──────────
function formatOrderItems(items) {
  return items.map(item => `
    <div class="order-item">
      <div class="item-image">
        <img src="${item.image || 'https://electricink.ie/images/placeholder.jpg'}" alt="${item.name}">
      </div>
      <div class="item-details">
        <div class="item-name">${item.name}</div>
        ${item.variant ? `<div class="item-variant">${item.variant}</div>` : ''}
        <div class="item-qty">Quantity: ${item.quantity}</div>
      </div>
      <div class="item-price">€${(item.price * item.quantity).toFixed(2)}</div>
    </div>
  `).join('');
}

// ────────── Helper: Format Order Items Table (Admin) ──────────
function formatOrderItemsTable(items) {
  return items.map(item => `
    <tr>
      <td>
        <span class="item-name">${item.name}</span>
        ${item.variant ? `<span class="item-variant">${item.variant}</span>` : ''}
      </td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">€${item.price.toFixed(2)}</td>
      <td style="text-align: right;">€${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');
}

// ────────── Helper: Format Cart Items Simple (Payment Failed) ──────────
function formatCartItemsSimple(items) {
  return items.map(item => `
    <div class="cart-item-simple">
      <div>
        <span class="cart-item-name">${item.name}</span>
        ${item.variant ? ` - ${item.variant}` : ''}
        <span class="cart-item-qty"> x${item.quantity}</span>
      </div>
      <div>€${(item.price * item.quantity).toFixed(2)}</div>
    </div>
  `).join('');
}

// ────────── Helper: Format Shipping Address ──────────
function formatShippingAddress(shipping) {
  return `
    ${shipping.firstName} ${shipping.lastName}<br>
    ${shipping.address}<br>
    ${shipping.address2 ? shipping.address2 + '<br>' : ''}
    ${shipping.city}, ${shipping.postalCode}<br>
    ${shipping.country}<br>
    ${shipping.phone}
  `;
}

// ────────── Main Handler ──────────
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

  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse request (Vercel auto-parses JSON)
    const { type, data } = req.body;

    // Validate
    if (!type || !data) {
      return res.status(400).json({ error: 'Missing type or data' });
    }

    let emailResult;

    // ────────── ORDER CONFIRMATION (Cliente) ──────────
    if (type === 'order-confirmation') {
      const template = loadTemplate('order-confirmation');
      
      const orderNumber = data.orderNumber || 'N/A';
      const orderItems = formatOrderItems(data.items || []);
      const shippingAddress = formatShippingAddress(data.shipping || {});
      
      const html = replacePlaceholders(template, {
        ORDER_NUMBER: orderNumber,
        ORDER_ITEMS: orderItems,
        SUBTOTAL: data.totals?.subtotal?.toFixed(2) || '0.00',
        SHIPPING: data.totals?.shippingText || 'FREE',
        VAT: data.totals?.vat?.toFixed(2) || '0.00',
        TOTAL: data.totals?.total?.toFixed(2) || '0.00',
        SHIPPING_ADDRESS: shippingAddress
      });

      emailResult = await resend.emails.send({
        from: 'Electric Ink <noreply@electricink.ie>',
        to: data.email,
        subject: `Order Confirmation #${orderNumber}`,
        html: html
      });
    }

    // ────────── ORDER NOTIFICATION (Admin) ──────────
    else if (type === 'order-notification-admin') {
      const template = loadTemplate('order-notification-admin');
      
      const orderNumber = data.orderNumber || 'N/A';
      const orderItemsTable = formatOrderItemsTable(data.items || []);
      const shippingAddress = formatShippingAddress(data.shipping || {});
      
      // Format phone for WhatsApp (remove formatting)
      const phoneWhatsApp = (data.shipping?.phone || '').replace(/[^0-9+]/g, '');
      
      const html = replacePlaceholders(template, {
        ORDER_NUMBER: orderNumber,
        CUSTOMER_NAME: `${data.shipping?.firstName || ''} ${data.shipping?.lastName || ''}`,
        CUSTOMER_EMAIL: data.email || '',
        CUSTOMER_PHONE: data.shipping?.phone || '',
        CUSTOMER_PHONE_WHATSAPP: phoneWhatsApp,
        SHIPPING_ADDRESS: shippingAddress,
        ORDER_ITEMS_TABLE: orderItemsTable,
        SUBTOTAL: data.totals?.subtotal?.toFixed(2) || '0.00',
        SHIPPING: data.totals?.shippingText || 'FREE',
        VAT: data.totals?.vat?.toFixed(2) || '0.00',
        TOTAL: data.totals?.total?.toFixed(2) || '0.00',
        ORDER_DATE: new Date().toLocaleString('en-IE', { 
          dateStyle: 'full', 
          timeStyle: 'short',
          timeZone: 'Europe/Dublin'
        })
      });

      emailResult = await resend.emails.send({
        from: 'Electric Ink Orders <orders@electricink.ie>',
        to: 'electricink.ie@gmail.com', // Email da loja
        subject: `🔔 New Order #${orderNumber}`,
        html: html
      });
    }

    // ────────── PAYMENT FAILED ──────────
    else if (type === 'payment-failed') {
      const template = loadTemplate('payment-failed');
      
      const cartItemsSimple = formatCartItemsSimple(data.items || []);
      
      const html = replacePlaceholders(template, {
        CUSTOMER_NAME: data.customerName || 'Customer',
        ERROR_MESSAGE: data.errorMessage || 'Your payment could not be processed.',
        CART_ITEMS_SIMPLE: cartItemsSimple,
        TOTAL: data.total?.toFixed(2) || '0.00'
      });

      emailResult = await resend.emails.send({
        from: 'Electric Ink <noreply@electricink.ie>',
        to: data.email,
        subject: 'Payment Issue - Electric Ink IE',
        html: html
      });
    }

    else {
      return res.status(400).json({ error: 'Invalid email type' });
    }

    return res.status(200).json({ 
      success: true, 
      id: emailResult.id 
    });

  } catch (error) {
    captureException(error, {
      endpoint: 'send-order-email',
      context: { type: req.body?.type, email: req.body?.data?.email }
    });
    console.error('Email sending error:', error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      message: error.message 
    });
  }
}
