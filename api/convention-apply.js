const logger = require('./lib/logger');

const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { organizer_name, email, convention_name, event_date, location } = req.body || {};

  if (!organizer_name || !email || !convention_name) {
    return res.status(400).json({ error: 'organizer_name, email and convention_name are required' });
  }

  try {
    const response = await fetch(`${INTERNAL_URL}/api/conventions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ organizer_name, email, convention_name, event_date, location }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      logger.error('Convention apply internal error', { status: response.status, err });
      return res.status(502).json({ error: 'Failed to submit application' });
    }

    const data = await response.json();
    return res.status(201).json({ success: true, id: data.id });

  } catch (err) {
    logger.error('Convention apply fetch error', err);
    return res.status(500).json({ error: 'Failed to submit application' });
  }
};
