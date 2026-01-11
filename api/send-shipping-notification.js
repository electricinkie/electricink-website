const { Resend } = require('resend');
const { getFirestore, admin } = require('./lib/firebase-admin');
const fs = require('fs');
const path = require('path');

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@electricink.ie';
const TEMPLATES_DIR = path.join(__dirname, '..', 'email-templates');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { orderId, trackingNumber, carrier, estimatedDelivery, trackingUrl } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'Order ID required' });

  const CARRIER_NAMES = {
    'anpost': 'An Post',
    'dpd': 'DPD Ireland',
    'fastway': 'Fastway Couriers',
    'ups': 'UPS',
    'dhl': 'DHL Express',
    'custom': 'Courier'
  };

  try {
    const db = getFirestore();
    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = doc.data();

    // Merge incoming shipping fields with stored order data for template rendering
    const merged = Object.assign({}, order, {
      trackingNumber: trackingNumber || order.trackingNumber || '',
      carrier: carrier || order.carrier || '',
      estimatedDelivery: estimatedDelivery || order.estimatedDelivery || null,
      trackingUrl: trackingUrl || order.trackingUrl || ''
    });

    // Read template
    const tplPath = path.join(TEMPLATES_DIR, 'order-shipped.html');
    let tpl = await fs.promises.readFile(tplPath, 'utf8');

    const itemsHtml = (order.items || []).map(i => `<div style="padding:8px 0;border-bottom:1px solid #eee"><strong>${i.name || i.id}</strong> x${i.quantity || 1} — €${((i.price || 0) * (i.quantity || 1)).toFixed(2)}</div>`).join('');

    tpl = tpl.replace(/{{\s*ORDER_NUMBER\s*}}/g, orderId || '');
    tpl = tpl.replace(/{{\s*TRACKING_NUMBER\s*}}/g, merged.trackingNumber || '');
    tpl = tpl.replace(/{{\s*CARRIER\s*}}/g, (CARRIER_NAMES[merged.carrier] || merged.carrier || '')); 
    tpl = tpl.replace(/{{\s*ORDER_ITEMS\s*}}/g, itemsHtml);
    tpl = tpl.replace(/{{\s*TOTAL\s*}}/g, ((order.total != null) ? Number(order.total) : (order.total_cents ? order.total_cents/100 : 0)).toFixed(2));
    tpl = tpl.replace(/{{\s*SHIPPING_ADDRESS\s*}}/g, (order.shippingAddress && (order.shippingAddress.line1 || order.shippingAddress.city)) ? `${order.shippingAddress.line1 || ''}<br>${order.shippingAddress.city || ''} ${order.shippingAddress.postalCode || order.shippingAddress.postal_code || ''}` : '');
    // Estimated delivery formatting
    let estDeliveryText = 'TBD';
    if (merged.estimatedDelivery) {
      try {
        const d = new Date(merged.estimatedDelivery);
        if (!isNaN(d.getTime())) {
          estDeliveryText = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      } catch (e) { estDeliveryText = String(merged.estimatedDelivery); }
    }
    tpl = tpl.replace(/{{\s*ESTIMATED_DELIVERY\s*}}/g, estDeliveryText || 'TBD');

    // Tracking URL replacement for CTA/button
    tpl = tpl.replace(/{{\s*TRACKING_URL\s*}}/g, merged.trackingUrl || '');

    await resend.emails.send({
      from: `Electric Ink <${EMAIL_FROM}>`,
      to: order.customerEmail,
      subject: `Your order has shipped — #${orderId}`,
      html: tpl
    });

    await db.collection('orders').doc(orderId).update({
      shippingNotificationSent: true,
      shippingNotificationSentAt: admin.firestore.Timestamp.now(),
      shippedEmailSent: true,
      shippedEmailSentAt: admin.firestore.Timestamp.now()
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('send-shipping-notification error', error);
    return res.status(500).json({ error: 'Failed to send shipping notification' });
  }
};
