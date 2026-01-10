// scripts/create-admin.js
// Usage: set ADMIN_EMAIL and optionally ADMIN_NAME env vars, then run:
// ADMIN_EMAIL=you@example.com node scripts/create-admin.js

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

if (!ADMIN_EMAIL) {
  console.error('Please set ADMIN_EMAIL environment variable. Example: ADMIN_EMAIL=you@example.com node scripts/create-admin.js');
  process.exit(1);
}

let serviceAccount = null;
try {
  // Try to load local service account shipped in repo (api/serviceAccountKey.json)
  const localPath = path.join(__dirname, '..', 'api', 'serviceAccountKey.json');
  if (fs.existsSync(localPath)) {
    serviceAccount = require(localPath);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  }
} catch (err) {
  console.warn('Could not parse local service account:', err && err.message);
}

if (!serviceAccount) {
  console.error('Firebase service account not found. Provide api/serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT env var.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function createAdmin() {
  try {
    let user = null;
    try {
      user = await admin.auth().getUserByEmail(ADMIN_EMAIL);
      console.log('Found existing user:', user.uid);
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') {
        // Create user with a random temporary password
        const tempPass = Math.random().toString(36).slice(-10) + 'A1!';
        user = await admin.auth().createUser({ email: ADMIN_EMAIL, password: tempPass, displayName: ADMIN_NAME });
        console.log('Created new auth user for admin:', user.uid, '(temp password provided)');
        console.log('Temporary password:', tempPass);
      } else {
        throw e;
      }
    }

    const uid = user.uid;

    // Set custom claim admin:true so the client can read request.auth.token.admin
    try {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
      console.log('✅ Set custom claim admin:true for', uid);
    } catch (claimErr) {
      console.warn('Could not set custom claim:', claimErr && claimErr.message);
    }

    // Write a human-readable admin doc in Firestore (server-only write)
    await admin.firestore().collection('admins').doc(uid).set({
      email: ADMIN_EMAIL,
      role: 'admin',
      name: ADMIN_NAME,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Admin record created in Firestore:', uid);
  } catch (err) {
    console.error('Failed to create admin:', err && err.message);
    process.exit(1);
  }
}

createAdmin();
