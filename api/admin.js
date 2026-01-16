// api/admin.js - admin router (centralize auth then dispatch to handlers)
// The update-order-status handler was deleted during cleanup — comment out
// the require to avoid crashing the dev server. Admin functionality isn't
// needed for local dev here.
// const updateOrderStatusHandler = require('./handlers/update-order-status');
const { getFirestore, admin } = require('./lib/firebase-admin');

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader || '').match(/^Bearer (.+)$/i);
  if (!match) return null;
  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded && decoded.uid;
    if (!uid) return null;

    // Quick admins collection check (fallback if no claim)
    const db = getFirestore();
    const adminSnap = await db.collection('admins').doc(uid).get();
    if (adminSnap.exists || decoded.admin) {
      return { uid, decoded };
    }
    return null;
  } catch (e) {
    try { console.warn('[Admin] verifyIdToken failed:', e && e.message); } catch (logErr) {}
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Secure CORS - only allow our domain
  const allowedOrigins = [
    'https://electricink.ie',
    'https://www.electricink.ie'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, data } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });

  const auth = await requireAdmin(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
    switch (action) {
      // 'update-order-status' handler removed during cleanup — not available in dev
      // case 'update-order-status':
      //   return await updateOrderStatusHandler(req, res);
      default:
        return res.status(400).json({ error: 'Invalid admin action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal error' });
  }
};
