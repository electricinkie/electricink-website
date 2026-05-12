const logger = { info: console.log, warn: console.warn, error: console.error };

const _rl = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const entry = _rl.get(key);
  if (!entry || now > entry.resetAt) {
    _rl.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true };
  }
  if (entry.count >= 10) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
  res.setHeader('Vary', 'Origin');
  const reqOrigin = req.headers.origin;
  if (reqOrigin === 'https://www.electricink.ie') {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.electricink.ie');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawIp = req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null)
    || 'unknown';
  const ip = /^[\w.:[\]-]{3,45}$/.test(rawIp) ? rawIp : 'unknown';
  try {
    const rl = await checkRateLimit(`convention_${ip}`);
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' });
  } catch (e) { logger.error('Rate limit check failed', e); }

  const { organizer_name, email, convention_name, event_date, location } = req.body || {};

  if (!organizer_name || !email || !convention_name) {
    return res.status(400).json({ error: 'organizer_name, email and convention_name are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (organizer_name.length > 100 || convention_name.length > 150 || email.length > 150) {
    return res.status(400).json({ error: 'One or more fields exceed maximum length' });
  }
  if ((location && location.length > 150) || (event_date && event_date.length > 50)) {
    return res.status(400).json({ error: 'One or more fields exceed maximum length' });
  }

  try {
    const response = await fetch(`${INTERNAL_URL}/api/conventions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ organizer_name, email, convention_name, event_date, location }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      logger.error('Convention apply internal error', { status: response.status, err });
      return res.status(502).json({ error: 'Failed to submit application' });
    }

    let data = {};
    try {
      data = await response.json();
    } catch (parseErr) {
      logger.warn('Convention apply: invalid JSON from internal', { status: response.status, error: parseErr && parseErr.message });
      data = {};
    }
    return res.status(201).json({ success: true, id: data && data.id ? data.id : null });

  } catch (err) {
    logger.error('Convention apply fetch error', err);
    return res.status(500).json({ error: 'Failed to submit application' });
  }
};
