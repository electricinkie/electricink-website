// Quick test: create & delete a Firebase Auth user using service account key
// Usage: node scripts/test-firebase-write.js

const path = require('path');
const admin = require('firebase-admin');

const keyPath = path.resolve(__dirname, '../api/serviceAccountKey.json');
let key;
try {
  key = require(keyPath);
} catch (e) {
  console.error('serviceAccountKey.json not found at', keyPath);
  process.exit(2);
}

try {
  admin.initializeApp({ credential: admin.credential.cert(key) });
} catch (e) {
  // ignore if already initialized
}

(async function run() {
  try {
    const email = `test+${Date.now()}@example.local`;
    const password = 'Test1234!';
    console.log('Creating user:', email);
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Created user uid=', userRecord.uid);

    // Clean up: delete the created user
    await admin.auth().deleteUser(userRecord.uid);
    console.log('Deleted user uid=', userRecord.uid);
    process.exit(0);
  } catch (err) {
    console.error('Error during Firebase test:', err);
    process.exit(1);
  }
})();
