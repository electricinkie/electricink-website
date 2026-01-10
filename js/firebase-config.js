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

// Timeout for CDN imports (ms). If imports fail or take too long we degrade gracefully.
const FIREBASE_IMPORT_TIMEOUT = 5000;

function importWithTimeout(src) {
  // Wrap dynamic import in a timeout to avoid hanging page loads when CDN is blocked
  return Promise.race([
    import(src),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Import timeout: ' + src)), FIREBASE_IMPORT_TIMEOUT))
  ]);
}

/**
 * Initialize Firebase (modular SDK) with graceful degradation.
 * On failure this function does NOT throw; it returns an object with
 * `ready: false` and `error` populated so callers can avoid crashing.
 *
 * IMPORTANT: callers that depend on firebase should check the returned
 * `auth` / `db` values before using them, or rely on the helper
 * `hideFirebaseDependentUI()` to remove UI elements that require Firebase.
 */
export async function initFirebase(config) {
  if (_app) return { app: _app, auth: _auth, db: _db, ready: true };
  const cfg = config || window.FIREBASE_CONFIG;
  if (!cfg) {
    const msg = 'FIREBASE_CONFIG not provided. Set window.FIREBASE_CONFIG before loading firebase-config.js';
    console.warn(msg);
    // Provide graceful object instead of throwing to allow page to render fallbacks
    window.__FIREBASE_READY = false;
    window.__FIREBASE_ERROR = msg;
    hideFirebaseDependentUI();
    return { app: null, auth: null, db: null, ready: false, error: msg };
  }

  try {
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js'),
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js'),
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js')
    ]);

    _app = initializeApp(cfg);
    _auth = authMod.getAuth(_app);
    _db = firestoreMod.getFirestore(_app);

    window.__FIREBASE_READY = true;
    window.__FIREBASE_ERROR = null;
    return { app: _app, auth: _auth, db: _db, ready: true };
  } catch (err) {
    // Log a friendly message and hide UI parts that depend on Firebase
    console.warn('Failed to initialize Firebase (graceful fallback):', err && err.message);
    window.__FIREBASE_READY = false;
    window.__FIREBASE_ERROR = err && err.message;
    hideFirebaseDependentUI();
    return { app: null, auth: null, db: null, ready: false, error: err && err.message };
  }
}

export function getAuthInstance() {
  if (!_auth) {
    throw new Error('Firebase Auth not initialized. Call initFirebase first.');
  }
  return _auth;
}

export function getFirestoreInstance() {
  if (!_db) {
    throw new Error('Firestore not initialized. Call initFirebase first.');
  }
  return _db;
}

/**
 * Hide elements that depend on Firebase, and optionally show fallbacks.
 * Use `data-firebase-required` on elements that must be hidden when Firebase is unavailable.
 * Use `data-firebase-fallback` on elements that should be shown instead.
 */
export function hideFirebaseDependentUI() {
  try {
    // Hide all elements marked as requiring Firebase
    const required = document.querySelectorAll('[data-firebase-required]');
    required.forEach(el => { el.style.display = 'none'; });

    // Show fallback elements if present
    const fallbacks = document.querySelectorAll('[data-firebase-fallback]');
    fallbacks.forEach(el => { el.style.display = ''; });

    // If there's a generic fallback container, populate with message
    const generic = document.getElementById('firebase-fallback');
    if (generic) {
      generic.innerText = 'Some features are temporarily unavailable. Please refresh or try again later.';
      generic.style.display = '';
    }
  } catch (e) {
    // Non-fatal
    console.warn('hideFirebaseDependentUI failed:', e && e.message);
  }
}