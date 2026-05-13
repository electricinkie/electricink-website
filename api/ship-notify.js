const fs = require('fs');
const path = require('path');
const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.log };
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports.config = {
  api: {
    bodyParser: true,
  },
};

module.exports = async function handler(req, res) {
  const requestId = req.headers['x-request-id'] || 'ship-notify-' + Date.now();

  if (req.method !== 'POST') {
    res.setHeader('x-request-id', requestId);
    return res.status(405).json({ error: 'Method not allowed', requestId });
  }

  const crypto = require('crypto');
  const secret = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.INTERNAL_WEBHOOK_SECRET || '';
  const secretValid = secret && expectedSecret &&
    secret.length === expectedSecret.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret));
  if (!secretValid) {
    logger.warn('Unauthorized ship-notify request', { requestId });
    res.setHeader('x-request-id', requestId);
    return res.status(401).json({ error: 'Unauthorized', requestId });
  }

  const { sale_id, tracking_number } = req.body || {};
  if (!sale_id || !tracking_number) {
    res.setHeader('x-request-id', requestId);
    return res.status(400).json({ error: 'Missing sale_id or tracking_number', requestId });
  }

  try {
    const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
    const saleRes = await fetch(`${INTERNAL_URL}/api/sales/${sale_id}`, {
      headers: { 'x-crm-secret': process.env.CRM_SECRET || '' },
      signal: AbortSignal.timeout(5000)
    });
    if (!saleRes.ok) {
      res.setHeader('x-request-id', requestId);
      return res.status(404).json({ error: 'Order not found', requestId });
    }
    const order = await saleRes.json();
    if (order.shipped_at) {
      res.setHeader('x-request-id', requestId);
      return res.status(200).json({ success: true, skipped: true, requestId });
    }

    // Build email data
    const ORDER_NUMBER = order.orderId || sale_id;
    const TRACKING_NUMBER = tracking_number;
    const CARRIER = (req.body.carrier && String(req.body.carrier)) || 'An Post';
    const ESTIMATED_DELIVERY = req.body.estimated_delivery || '2-3 business days';
    let TRACKING_URL = '';
    if (!CARRIER || /an post/i.test(CARRIER)) {
      TRACKING_URL = `https://track.anpost.ie/TrackItems?id=${encodeURIComponent(TRACKING_NUMBER)}`;
    } else {
      TRACKING_URL = `https://www.google.com/search?q=${encodeURIComponent(TRACKING_NUMBER)}`;
    }

    const shippingParts = [];
    if (order.shippingAddress) {
      const sa = order.shippingAddress;
      ['line1', 'line2', 'city', 'postalCode', 'country'].forEach(k => {
        if (sa[k]) shippingParts.push(sa[k]);
      });
    }
    const SHIPPING_ADDRESS = escapeHtml(shippingParts.filter(Boolean).join(', '));

    const SUBTOTAL = ((order.subtotal || 0)).toFixed(2);
    const SHIPPING = (order.shippingCost && order.shippingCost > 0) ? ('€' + Number(order.shippingCost).toFixed(2)) : 'Free';
    // VAT: prefer explicit stored `order.vat` when available (number), otherwise
    // compute VAT portion as reverse-rate from subtotal (prices include VAT)
    let VAT = 0;
    if (order.vat !== undefined && !isNaN(Number(order.vat))) {
      VAT = Number(order.vat).toFixed(2);
    } else {
      const base = (order.subtotal || 0);
      const computed = base - (base / 1.23);
      VAT = (computed > 0 ? computed : 0).toFixed(2);
    }
    const TOTAL = ((order.total || 0)).toFixed(2);

    // Build ORDER_ITEMS HTML rows
    const items = order.items || [];
    const itemsHtml = (items || []).map(item => {
      const name = escapeHtml(item.name || item.id || 'Item');
      const quantity = item.quantity || 1;
      const unit = (item.unit_amount !== undefined && item.unit_amount !== null)
        ? (item.unit_amount / 100)
        : (item.price !== undefined ? item.price : (item.amount_total !== undefined ? (item.amount_total / 100) : 0));
      const price = Number(unit || 0);
      const lineTotal = (price * quantity) || 0;
      return `\n          <tr>\n            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">\n              <strong>${name}</strong>\n            </td>\n            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: center; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">${quantity}</td>\n            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000;">€${price.toFixed(2)}</td>\n            <td style="padding: 12px; border-bottom: 1px solid #e8e8e8; text-align: right; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 13px; color: #000000; font-weight: 700;">€${lineTotal.toFixed(2)}</td>\n          </tr>\n        `;
    }).join('');

    // Load template
    let template = '';
    try {
      template = fs.readFileSync(path.join(process.cwd(), 'email-templates', 'order-shipped.html'), 'utf8');
    } catch (tplErr) {
      logger.error('Failed to load order-shipped template', { error: tplErr && tplErr.message, requestId });
      res.setHeader('x-request-id', requestId);
      return res.status(500).json({ error: 'Template load failed', requestId });
    }

    // Render template — do not escape ORDER_ITEMS or TRACKING_URL
    let finalHtml = template
      .replace(/{{ORDER_NUMBER}}/g, escapeHtml(ORDER_NUMBER))
      .replace(/{{TRACKING_NUMBER}}/g, escapeHtml(TRACKING_NUMBER))
      .replace(/{{CARRIER}}/g, escapeHtml(CARRIER))
      .replace(/{{ESTIMATED_DELIVERY}}/g, escapeHtml(ESTIMATED_DELIVERY))
      .replace(/{{TRACKING_URL}}/g, TRACKING_URL)
      .replace(/{{SHIPPING_ADDRESS}}/g, SHIPPING_ADDRESS)
      .replace(/{{SUBTOTAL}}/g, SUBTOTAL)
      .replace(/{{SHIPPING}}/g, SHIPPING)
      .replace(/{{VAT}}/g, VAT)
      .replace(/{{TOTAL}}/g, TOTAL)
      .replace(/{{ORDER_ITEMS}}/g, itemsHtml);

    if (!resend) {
      logger.error('Resend not configured - cannot send shipping email', { requestId });
      res.setHeader('x-request-id', requestId);
      return res.status(500).json({ error: 'Resend not configured', requestId });
    }

    // Send email and update Firestore
    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: order.customerEmail,
        subject: `Your order has shipped — #${ORDER_NUMBER}`,
        html: finalHtml
      });

      logger.info('Ship notification email sent', { orderId: ORDER_NUMBER, emailId: result.id, requestId });

      // Firestore removed — shipped_at already updated in internal via PATCH /api/sales/:id/ship

      res.setHeader('x-request-id', requestId);
      return res.status(200).json({ success: true, requestId });
    } catch (sendErr) {
      logger.error('Failed to send ship notification email', { error: sendErr && sendErr.message, requestId });
      res.setHeader('x-request-id', requestId);
      return res.status(500).json({ error: sendErr && sendErr.message, requestId });
    }

  } catch (err) {
    logger.error('Error in ship-notify handler', { error: err && err.message });
    res.setHeader('x-request-id', requestId);
    return res.status(500).json({ error: 'Internal error', requestId });
  }
};
