// Serverless endpoint: Return authenticated user's orders with legacy fallbacks
// Expects: Authorization: Bearer <Firebase ID token>
// Query params: ?limit=number (default 50)

const { getFirestore, admin } = require('./lib/firebase-admin');
const logger = require('./lib/logger');
const { captureException } = require('./lib/sentry');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader || '').match(/^Bearer (.+)$/i);
  if (!match) return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  const idToken = match[1];

  try {
    const db = getFirestore();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded && decoded.uid;
    const email = decoded && decoded.email;
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    // Pagination params (simple): limit (max 200)
    const q = req.query || {};
    let limit = parseInt(q.limit, 10) || 50;
    if (limit <= 0) limit = 50;
    if (limit > 200) limit = 200;

    // Build three queries (UID, legacy userId==email, customerEmail==email)
    const ordersRef = db.collection('orders');

    const results = [];
    const seen = new Set();

    // Helper to run a query and push docs to results (no ordering to avoid composite index requirements)
    async function runWhere(field, op, value) {
      try {
        const snap = await ordersRef.where(field, op, value).limit(limit).get();
        snap.forEach(d => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          // Normalize createdAt to milliseconds for safe JSON transport
          const ca = data && data.createdAt;
          let createdAt = null;
          try {
            if (ca && typeof ca.toMillis === 'function') createdAt = ca.toMillis();
            else if (ca && typeof ca.seconds === 'number') createdAt = ca.seconds * 1000;
            else if (typeof ca === 'number') createdAt = ca;
            else createdAt = ca ? Date.parse(String(ca)) : null;
          } catch (e) {
            createdAt = null;
          }

          results.push(Object.assign({ id: d.id, createdAt }, data));
        });
      } catch (err) {
        logger && logger.warn && logger.warn('my-orders: query failed', { field, err: err && err.message });
      }
    }

    // Run queries in series to avoid Firestore throttle in some environments
    await runWhere('userId', '==', uid);
    if (email) await runWhere('userId', '==', email);
    if (email) await runWhere('customerEmail', '==', email);

    // Sort results by createdAt desc (nulls at bottom)
    results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Trim to requested limit
    const payload = results.slice(0, limit);

    return res.status(200).json({ success: true, orders: payload });
  } catch (err) {
    captureException && captureException(err, { endpoint: 'my-orders' });
    logger && logger.error && logger.error('Error in my-orders', err && err.message);
    return res.status(500).json({ error: 'Internal server error', details: err && err.message });
  }
};
// Simple endpoint to return orders for authenticated user.
// Verifies Firebase ID token server-side and queries Firestore for orders.userId == uid.
const { getFirestore, admin } = require('./lib/firebase-admin');
const logger = require('./lib/logger');

module.exports = async function handler(req, res) {
  // DEBUG: log incoming request metadata
  console.log('🔐 [MY-ORDERS] Request recebida:', {
    hasAuthHeader: !!req.headers.authorization,
    authHeaderStart: req.headers.authorization?.substring(0, 30),
    method: req.method,
    timestamp: new Date().toISOString()
  });
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
    // NOVO LOG
    console.log('🔍 [MY-ORDERS] Iniciando busca de pedidos:', {
      uid,
      tokenEmail,
      timestamp: new Date().toISOString()
    });
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    const db = getFirestore();
    // First try UID-based lookup (preferred)
    let snap = await db.collection('orders')
      .where('userId', '==', String(uid))
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // NOVO LOG
    console.log('📊 [MY-ORDERS] Query por userId retornou:', orders.length, 'pedidos');

    // If none found, fall back to server-side email lookup (safe)
    if ((!orders || orders.length === 0) && tokenEmail) {
      try {
        const snapByEmail = await db.collection('orders')
          .where('customerEmail', '==', String(tokenEmail))
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        orders = snapByEmail.docs.map(d => ({ id: d.id, ...d.data() }));
        // NOVO LOG
        console.log('📊 [MY-ORDERS] Query por email retornou:', orders.length, 'pedidos');
      } catch (e) {
        // If this query requires an index not yet present, log and continue returning empty
        console.warn('my-orders: email lookup failed', e && e.message);
      }
    }

    return res.status(200).json({ orders });
  } catch (err) {
    console.error('❌ [MY-ORDERS] Erro:', {
      code: err && err.code,
      message: err && err.message
    });

    // Token inválido ou expirado
    if (err.code === 'auth/id-token-expired' || 
        err.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Erro de índice do Firestore
    if (err.code === 9) { // FAILED_PRECONDITION
      console.warn('⚠️ [MY-ORDERS] Firestore index missing');
      return res.status(500).json({ 
        error: 'Database index required',
        message: 'Please contact support' 
      });
    }

    // Outros erros
    logger && logger.error && logger.error('my-orders error', err && err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
