// Simple endpoint to return orders for authenticated user.
// Verifies Firebase ID token server-side and queries Firestore for orders.userId == uid.
const { getFirestore, admin } = require('./lib/firebase-admin');
const logger = require('./lib/logger');

module.exports = async function handler(req, res) {
  // Allow only GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Expect Authorization: Bearer <idToken>
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });

  try {
    if (!admin || !admin.apps || !admin.apps.length) {
      // Initialize Firestore admin in environments where lib does lazy init
      getFirestore();
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded && decoded.uid;
    const tokenEmail = decoded && decoded.email;
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    const db = getFirestore();
    // First try UID-based lookup (preferred)
    let snap = await db.collection('orders')
      .where('userId', '==', String(uid))
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // If none found, fall back to server-side email lookup (safe)
    if ((!orders || orders.length === 0) && tokenEmail) {
      try {
        const snapByEmail = await db.collection('orders')
          .where('customerEmail', '==', String(tokenEmail))
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        orders = snapByEmail.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        // If this query requires an index not yet present, log and continue returning empty
        console.warn('my-orders: email lookup failed', e && e.message);
      }
    }

    return res.status(200).json({ orders });
  } catch (err) {
    logger && logger.error && logger.error('my-orders error', err && err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
