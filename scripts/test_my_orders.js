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

    // Call api/my-orders handler directly
    const handler = require(path.join(__dirname, '..', 'api', 'my-orders.js'));

    // Mock req/res
    const req = { method: 'GET', headers: { authorization: `Bearer ${idToken}` } };
    let resStatus = null;
    let jsonOut = null;
    const res = {
      setHeader: (k,v) => {},
      status: (s) => { resStatus = s; return res; },
      json: (obj) => { jsonOut = obj; console.log('[TEST] Handler response status=', resStatus); console.log(JSON.stringify(obj, null, 2)); }
    };

    await handler(req, res);
    process.exit(0);
  } catch (err) {
    console.error('[TEST] ERROR', err && err.message);
    process.exit(1);
  }
})();
