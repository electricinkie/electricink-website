// Serverless endpoint: Update order status via OrderManager (admin-only)
// Expects: Authorization: Bearer <Firebase ID token>
// Body: { orderId: string, status: string, note?: string }

const { initializeFirebaseAdmin, getFirestore, admin } = require('./lib/firebase-admin');
const OrderManager = require('./oms/order-manager');
const logger = require('./lib/logger');
const { captureException } = require('./lib/sentry');

module.exports = async function handler(req, res) {
  // CORS (match other endpoints)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader || '').match(/^Bearer (.+)$/i);
  if (!match) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

  const idToken = match[1];

  try {
    // Initialize admin SDK and verify token
    const db = getFirestore();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded && decoded.uid;
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    // Check admin role existence in admins/{uid}
    const adminRef = db.collection('admins').doc(uid);
    const adminSnap = await adminRef.get();
    if (!adminSnap.exists) return res.status(403).json({ error: 'Forbidden: admin required' });

    // Parse body
    const { orderId, status, note } = req.body || {};
    if (!orderId || !status) return res.status(400).json({ error: 'orderId and status are required' });

    // Perform status update via OrderManager (server-side authority)
    const orderManager = new OrderManager(db);
    await orderManager.updateStatus(String(orderId), String(status), String(note || ''));

    logger.info('Order status updated via API', { orderId, status, by: uid });
    return res.status(200).json({ success: true });
  } catch (err) {
    captureException(err, { endpoint: 'update-order-status' });
    logger.error('Error in update-order-status', err && err.message);
    return res.status(500).json({ error: 'Internal server error', details: err && err.message });
  }
};
