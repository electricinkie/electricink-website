const path = require('path');
const fetch = require('node-fetch');
(async function(){
  try {
    const sa = require(path.join(__dirname, '..', 'api', 'serviceAccountKey.json'));
    const firebaseConfig = require(path.join(__dirname, '..', 'firebase-config.json'));
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
    const db = admin.firestore();

    const email = 'contatonegostando@gmail.com';
    console.log('[TEST] Ensuring user exists for email:', email);
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log('[TEST] User exists:', userRecord.uid);
    } catch (e) {
      console.log('[TEST] User not found, creating new user');
      userRecord = await admin.auth().createUser({ email, password: 'TempPass123!' });
      console.log('[TEST] Created user:', userRecord.uid);
    }

    // Create custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    console.log('[TEST] Custom token created');

    // Exchange custom token for ID token using Firebase Auth REST API
    const apiKey = firebaseConfig.apiKey;
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    const body = await resp.json();
    if (!body.idToken) {
      console.error('[TEST] Failed to exchange custom token:', body);
      process.exit(1);
    }
    const idToken = body.idToken;
    console.log('[TEST] Obtained idToken for user, length=', idToken.length);

    // Verify token server-side
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('[TEST] Decoded token uid/email:', decoded.uid, decoded.email);

    // Query orders by userId
    const uid = decoded.uid;
    const tokenEmail = decoded.email;

    console.log('[TEST] Querying orders by userId (uid):', uid);
    let orders = [];
    try {
      const snap = await db.collection('orders').where('userId', '==', String(uid)).orderBy('createdAt', 'desc').limit(50).get();
      orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[TEST] Orders found by UID:', orders.length);
    } catch (e) {
      console.warn('[TEST] UID lookup failed (possibly missing index):', e && e.message);
    }

    if ((!orders || orders.length === 0) && tokenEmail) {
      console.log('[TEST] Fallback: Querying by customerEmail:', tokenEmail);
      try {
        const snapByEmail = await db.collection('orders').where('customerEmail', '==', String(tokenEmail)).orderBy('createdAt', 'desc').limit(50).get();
        orders = snapByEmail.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('[TEST] Orders found by email:', orders.length);
      } catch (e) {
        console.warn('[TEST] email lookup failed', e && e.message);
      }
    }

    console.log('--- ORDERS ---');
    console.log(JSON.stringify(orders, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[TEST] ERROR', err && err.message);
    process.exit(1);
  }
})();
