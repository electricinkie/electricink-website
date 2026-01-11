// api/admin.js - admin router (centralize auth then dispatch to handlers)
const updateOrderStatusHandler = require('./handlers/update-order-status');
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
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
      case 'update-order-status':
        // update-order-status handler itself performs auth checks as well (safe/defensive)
        return await updateOrderStatusHandler(req, res);
      default:
        return res.status(400).json({ error: 'Invalid admin action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal error' });
  }
};
