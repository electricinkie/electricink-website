// api/emails.js - unified email router (dispatches to handlers/*)
// Expects POST with JSON { type: string, data?: object, ... }
// For legacy handlers that expect top-level fields, the router will merge `data` into req.body before calling.

const sendOrderEmail = require('./handlers/send-order-email');
const sendShippingNotification = require('./handlers/send-shipping-notification');
const sendShippingConfirmation = require('./handlers/send-shipping-confirmation');

module.exports = async function handler(req, res) {
  // Basic CORS + method guard (mirror existing endpoints)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { type, data } = body;

  if (!type) return res.status(400).json({ error: 'Missing type' });

  // For handlers that expect parameters at top-level (legacy), merge `data` into req.body.
  // Preserve original body for handlers that already expect { type, data }.
  const mergedReq = Object.assign({}, req);
  mergedReq.body = Object.assign({}, req.body || {}, (data && typeof data === 'object') ? data : {});

  try {
    switch (type) {
      // send-order-email handles multiple email variants (order-confirmation, admin notification, payment-failed)
      case 'order-confirmation':
      case 'order-notification-admin':
      case 'payment-failed':
        // these handlers expect { type, data } style; call original req to keep `type` available
        return await sendOrderEmail(req, res);

      // shipping notification requires Authorization and expects orderId at top-level
      case 'shipping-notification':
        return await sendShippingNotification(mergedReq, res);

      // shipping confirmation expects orderId at top-level
      case 'shipping-confirmation':
        return await sendShippingConfirmation(mergedReq, res);

      default:
        return res.status(400).json({ error: 'Invalid email type' });
    }
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal error' });
  }
};
