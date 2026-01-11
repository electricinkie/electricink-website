const admin = require('firebase-admin');
const path = require('path');
(async function(){
  try {
    const sa = require(path.join(__dirname, '..', 'api', 'serviceAccountKey.json'));
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
    const db = admin.firestore();
    const id = process.argv[2] || '1e9D265gpbUzvQPxXXAk';
    console.log('[TMP] Reading order id:', id);
    const snap = await db.collection('orders').doc(id).get();
    if (!snap.exists) {
      console.log('[TMP] NOT FOUND');
      process.exit(0);
    }
    console.log('--- DOCUMENT FIELDS ---');
    console.log(JSON.stringify(snap.data(), null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[TMP] ERROR', err && err.message);
    process.exit(1);
  }
})();
