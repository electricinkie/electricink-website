const admin = require('firebase-admin');

// Adjust path to service account if needed
const serviceAccount = require('../api/serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/set-admin.js <UID>');
  process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log('Custom claim "admin" set for', uid);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error setting claim:', err);
    process.exit(1);
  });
