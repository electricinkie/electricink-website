// Serverless endpoint: Return authenticated user's orders
// Expects: Authorization: Bearer <Firebase ID token>
// Query params: ?limit=number (default 50)

const { getFirestore, admin } = require('./lib/firebase-admin');
const logger = require('./lib/logger');
const { captureException } = require('./lib/sentry');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader || '').match(/^Bearer (.+)$/i);
  if (!match) {
    console.log('❌ [MY-ORDERS] Missing auth header');
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }
  const idToken = match[1];

  console.log('🔐 [MY-ORDERS] Request received, verifying token...');

  try {
    const db = getFirestore();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded && decoded.uid;
    const email = decoded && decoded.email;
    
    console.log('🔐 User authenticated:', uid ? '✅' : '❌');
    
    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    // Pagination params
    const q = req.query || {};
    let limit = parseInt(q.limit, 10) || 50;
    if (limit <= 0) limit = 50;
    if (limit > 200) limit = 200;

    const ordersRef = db.collection('orders');
    const results = [];
    const seen = new Set();

    // Helper to run query without orderBy (avoids index requirement)
    async function runWhere(field, op, value) {
      try {
        console.log(`🔍 [MY-ORDERS] Query: ${field} ${op} ${value}`);
        const snap = await ordersRef.where(field, op, value).limit(limit).get();
        
        console.log(`📊 [MY-ORDERS] Query ${field} returned ${snap.size} results`);
        
        snap.forEach(d => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          
          // Normalize createdAt
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
        console.warn(`⚠️ [MY-ORDERS] Query ${field} failed:`, err.message);
      }
    }

    // Run queries (no orderBy = no index needed!)
    await runWhere('userId', '==', uid);
    if (email) await runWhere('userId', '==', email);
    if (email) await runWhere('customerEmail', '==', email);

    // Sort client-side
    results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const payload = results.slice(0, limit);
    
    console.log(`✅ [MY-ORDERS] Returning ${payload.length} orders`);

    return res.status(200).json({ success: true, orders: payload });
    
  } catch (err) {
    console.error('❌ [MY-ORDERS] Error:', err.message);
    
    captureException && captureException(err, { endpoint: 'my-orders' });
    logger && logger.error && logger.error('Error in my-orders', err.message);
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
};
