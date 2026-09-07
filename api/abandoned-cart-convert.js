const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.log };

module.exports.config = {
  api: {
    bodyParser: true,
  },
};

module.exports = async function handler(req, res) {
  const requestId = req.headers['x-request-id'] || 'abandoned-cart-convert-' + Date.now();

  if (req.method !== 'POST') {
    res.setHeader('x-request-id', requestId);
    return res.status(405).json({ error: 'Method not allowed', requestId });
  }

  const { email } = req.body || {};
  if (!email) {
    res.setHeader('x-request-id', requestId);
    return res.status(400).json({ error: 'Missing email', requestId });
  }

  try {
    const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
    const upstream = await fetch(`${INTERNAL_URL}/api/abandoned-cart/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.INTERNAL_WEBHOOK_SECRET || ''
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(5000)
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      payload = { raw: text };
    }

    if (!upstream.ok) {
      logger.warn('Internal abandoned-cart convert failed', { status: upstream.status, requestId });
    }

    res.setHeader('x-request-id', requestId);
    return res.status(upstream.status).json(payload);
  } catch (err) {
    logger.error('Error in abandoned-cart-convert handler', { error: err && err.message, requestId });
    res.setHeader('x-request-id', requestId);
    return res.status(500).json({ error: 'Internal error', requestId });
  }
};
