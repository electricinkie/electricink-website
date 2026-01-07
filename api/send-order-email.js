const { Resend } = require('resend');

// Instanciação guardada - não falha se API key ausente
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
const fs = require('fs');
const path = require('path');
const { captureException } = require('./lib/sentry');

// ❌ REMOVIDO DAQUI: const resend = new Resend(process.env.RESEND_API_KEY);
// ✅ Agora será instanciado DENTRO do handler

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

// ────────── Helper: Enrich Items ──────────
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
        console.warn('Failed to load product data file', file, e && e.message);
        try { captureException(e, { file }); } catch (ie) { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('Failed to read data directory for enrichItems:', e && e.message);
    try { captureException(e, { fn: 'enrichItems' }); } catch (ie) { /* ignore */ }
  }
  
  const publicBaseUrl = 'https://electricink.ie';
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
      image: variant && variant.image
        ? (variant.image.startsWith('http') ? variant.image : publicBaseUrl + variant.image)
        : (product.image ? (product.image.startsWith('http') ? product.image : publicBaseUrl + product.image) : publicBaseUrl + '/images/placeholder.jpg'),
      price: variant && typeof variant.price === 'number' ? variant.price : (typeof product.price === 'number' ? product.price : item.price),
      quantity: item.quantity || 1
    };
  });
}

// ────────── Main Handler ──────────
module.exports = async function handler(req, res) {
  // Adicionar ESTA verificação no INÍCIO
  if (!resend) {
    console.error('Resend not initialized - cannot send email');
    return res.status(503).json({ 
      error: 'Email service unavailable',
      reason: 'RESEND_API_KEY not configured' 
    });
  }
  
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;

    if (!type || !data) {
      return res.status(400).json({ error: 'Missing type or data' });
    }

    // Resend já está instanciado no topo do arquivo e verificado acima
    // console.log('✅ Resend client initialized');

    let emailResult;

    // ═══════════════════════════════════════════════════════
    // CLIENTE
    // ═══════════════════════════════════════════════════════
    if (type === 'order-confirmation') {
      const template = loadTemplate('order-confirmation');
      const orderNumber = data.orderNumber || 'N/A';
      const enrichedItems = enrichItems(data.items || []);
      const orderItems = formatOrderItems(enrichedItems);
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

      console.log('✅ [CLIENTE] E-mail enviado:', emailResult.id);
    }
    
    // ═══════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════
    else if (type === 'order-notification-admin') {
      const template = loadTemplate('order-notification-admin');
      const orderNumber = data.orderNumber || 'N/A';
      const enrichedItems = enrichItems(data.items || []);
      const orderItemsTable = formatOrderItemsTable(enrichedItems);
      const shippingAddress = formatShippingAddress(data.shipping || {});
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
        to: 'electricink.ie@gmail.com',
        subject: `🔔 New Order #${orderNumber}`,
        html: html
      });

      console.log('✅ [ADMIN] E-mail enviado:', emailResult.id);
    }
    
    // ═══════════════════════════════════════════════════════
    // PAYMENT FAILED
    // ═══════════════════════════════════════════════════════
    else if (type === 'payment-failed') {
      const template = loadTemplate('payment-failed');
      const enrichedItems = enrichItems(data.items || []);
      const cartItemsSimple = formatCartItemsSimple(enrichedItems);
      
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

      console.log('✅ [PAYMENT-FAILED] E-mail enviado:', emailResult.id);
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
    
    console.error('❌ [ERRO] Tipo:', req.body?.type);
    console.error('❌ [ERRO] Mensagem:', error.message);
    
    return res.status(500).json({ 
      error: 'Failed to send email',
      message: error.message 
    });
  }
}