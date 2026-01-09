// Lightweight Firebase initializer (modular SDK via CDN)
// USAGE and CONFIG
// The module expects a Firebase client config available as `window.FIREBASE_CONFIG`.
// You should set this object in your HTML before importing any modules that
// call `initFirebase`.
// Example (place in your HTML <head> or just before the module script):
//
// <script>
//   window.FIREBASE_CONFIG = {
//     apiKey: "YOUR_API_KEY",
//     authDomain: "your-project.firebaseapp.com",
//     projectId: "your-project-id",
//     storageBucket: "your-project.appspot.com",
//     messagingSenderId: "1234567890",
//     appId: "1:1234567890:web:abcdefg",
//   };
// </script>
// <script type="module" src="/js/profile.js"></script>
//
// Security note: Do NOT commit secrets to the repository. Use build-time
// environment injection or hosting provider environment variables to supply
// the `window.FIREBASE_CONFIG` values in production. The values above are safe
// to appear in client-side code (they are Firebase public config), but keep
// credentials for admin/service accounts out of the client.
//
// Usage: await initFirebase(window.FIREBASE_CONFIG)
let _app = null;
let _auth = null;
let _db = null;

export async function initFirebase(config) {
  if (_app) return { app: _app, auth: _auth, db: _db };
  const cfg = config || window.FIREBASE_CONFIG;
  if (!cfg) throw new Error('FIREBASE_CONFIG not provided. Set window.FIREBASE_CONFIG before loading firebase-config.js');

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js');
  const authMod = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  const firestoreMod = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');

  _app = initializeApp(cfg);
  _auth = authMod.getAuth(_app);
  _db = firestoreMod.getFirestore(_app);

  return { app: _app, auth: _auth, db: _db };
}

export function getAuthInstance() {
  if (!_auth) throw new Error('Firebase Auth not initialized. Call initFirebase first.');
  return _auth;
}

export function getFirestoreInstance() {
  if (!_db) throw new Error('Firestore not initialized. Call initFirebase first.');
  return _db;
}