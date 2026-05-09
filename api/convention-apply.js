const logger = require('./lib/logger');
const { getFirestore, admin } = require('./lib/firebase-admin');

async function checkRateLimit(key) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return { allowed: true };
  try { getFirestore(); } catch (e) { return { allowed: true }; }
  if (!admin.apps || !admin.apps.length) return { allowed: true };
  const db = admin.firestore();
  const LIMIT = 10;
  const WINDOW_SECONDS = 60;
  const docRef = db.collection('rate_limits').doc(key);
  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      const now = Date.now();
      if (!doc.exists) {
        const resetAt = admin.firestore.Timestamp.fromMillis(now + WINDOW_SECONDS * 1000);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
        tx.set(docRef, { count: 1, resetAt, expiresAt });
        return { allowed: true };
      }
      const data = doc.data() || {};
      const resetAtMillis = (data.resetAt && typeof data.resetAt.toMillis === 'function') ? data.resetAt.toMillis() : (data.resetAt || 0);
      if (now > resetAtMillis) {
        const resetAt = admin.firestore.Timestamp.fromMillis(now + WINDOW_SECONDS * 1000);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
        tx.set(docRef, { count: 1, resetAt, expiresAt });
        return { allowed: true };
      }
      if ((data.count || 0) >= LIMIT) return { allowed: false };
      tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
      return { allowed: true };
    });
    return result;
  } catch (err) {
    logger.error('Rate limit transaction failed', err);
    return { allowed: true };
  }
}

const INTERNAL_URL = process.env.INTERNAL_API_URL || 'https://ei-internal-production.up.railway.app';
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
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
