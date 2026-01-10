const { Resend } = require('resend');
const { getFirestore, admin } = require('./lib/firebase-admin');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'Order ID required' });

  try {
    const db = getFirestore();
    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = doc.data();

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@electricink.ie',
      to: order.customerEmail,
      subject: `Seu pedido foi enviado! #${orderId}`,
      html: shippingEmailTemplate(order, orderId)
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Send shipping email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};

function shippingEmailTemplate(order, orderId) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;color:#333} .container{max-width:600px;margin:0 auto;padding:20px}.header{background:#2dd4bf;color:#fff;padding:20px;text-align:center}.content{padding:20px;background:#f9f9f9}.order-info{background:#fff;padding:16px;border-radius:8px;margin:16px 0}.btn{display:inline-block;background:#2dd4bf;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none}</style></head><body><div class="container"><div class="header"><h1>📦 Pedido Enviado!</h1></div><div class="content"><p>Olá ${order.customerName || ''},</p><p>Ótimas notícias! Seu pedido foi enviado e está a caminho.</p><div class="order-info"><h3>Detalhes do Pedido</h3><p><strong>Order ID:</strong> ${orderId}</p><p><strong>Total:</strong> €${Number(order.total || 0).toFixed(2)}</p><p><strong>Status:</strong> Enviado</p></div><p>Endereço de envio:</p><p>${order.shippingAddress?.line1 || ''}<br>${order.shippingAddress?.city || ''} ${order.shippingAddress?.postal_code || ''}</p><p>Obrigado por comprar na Electric Ink!</p><a href="https://electricink.ie" class="btn">Visitar Loja</a></div><div style="text-align:center;padding:16px;color:#666;font-size:13px">Electric Ink Ireland - Tattoo Supplies</div></div></body></html>`;
}
