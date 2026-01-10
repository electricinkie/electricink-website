// ============================================
// Firebase Config - FIXED PERSISTENCE
// ============================================
// MUDANÇAS:
// 1. setPersistence ANTES de retornar auth
// 2. Persistence configurada ANTES de qualquer auth operation
// 3. Logs de debug para troubleshooting
// ============================================

let _app = null;
let _auth = null;
let _db = null;

const FIREBASE_IMPORT_TIMEOUT = 5000;

function importWithTimeout(src) {
  return Promise.race([
    import(src),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Import timeout: ' + src)), FIREBASE_IMPORT_TIMEOUT)
    )
  ]);
}

export async function initFirebase(config) {
  // ✅ Se já inicializado, retorna cached instance
  if (_app && _auth && _db) {
    console.log('[Firebase] Using cached instance');
    return { app: _app, auth: _auth, db: _db, ready: true };
  }

  const cfg = config || window.FIREBASE_CONFIG;
  if (!cfg) {
    const msg = 'FIREBASE_CONFIG not provided. Set window.FIREBASE_CONFIG before loading firebase-config.js';
    console.warn(msg);
    window.__FIREBASE_READY = false;
    window.__FIREBASE_ERROR = msg;
    hideFirebaseDependentUI();
    return { app: null, auth: null, db: null, ready: false, error: msg };
  }

  try {
    // ✅ PASSO 1: Import todos os módulos necessários
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js'),
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js'),
      importWithTimeout('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js')
    ]);

    console.log('[Firebase] ✅ SDK modules loaded');

    // ✅ PASSO 2: Initialize app
    _app = initializeApp(cfg);
    console.log('[Firebase] ✅ App initialized');

    // ✅ PASSO 3: Get auth instance
    _auth = authMod.getAuth(_app);
    console.log('[Firebase] ✅ Auth instance created');

    // ✅ PASSO 4: CRITICAL - Set persistence BEFORE returning auth
    // This MUST complete before any signIn/signUp operations
    try {
      await authMod.setPersistence(_auth, authMod.browserLocalPersistence);
      console.log('[Firebase] ✅ Persistence set to LOCAL (browserLocalPersistence)');
    } catch (persistErr) {
      console.error('[Firebase] ❌ CRITICAL: Could not set persistence:', persistErr);
      console.warn('[Firebase] ⚠️ User WILL be logged out on page reload!');
      // Still proceed but warn loudly
    }

    // ✅ PASSO 5: Verify storage availability (diagnostic)
    try {
      // Test localStorage
      localStorage.setItem('firebase-persistence-test', '1');
      localStorage.removeItem('firebase-persistence-test');
      console.log('[Firebase] ✅ localStorage available');

      // Test IndexedDB (Firebase uses this for persistence)
      const testIDB = indexedDB.open('firebase-persistence-test');
      testIDB.onsuccess = () => {
        console.log('[Firebase] ✅ IndexedDB available');
        try { indexedDB.deleteDatabase('firebase-persistence-test'); } catch (e) {}
      };
      testIDB.onerror = () => {
        console.warn('[Firebase] ⚠️ IndexedDB blocked - persistence may fail');
      };
    } catch (e) {
      console.warn('[Firebase] ⚠️ Storage check failed:', e.message);
    }

    // ✅ PASSO 6: Initialize Firestore
    _db = firestoreMod.getFirestore(_app);
    console.log('[Firebase] ✅ Firestore initialized');

    // ✅ PASSO 7: Mark as ready
    window.__FIREBASE_READY = true;
    window.__FIREBASE_ERROR = null;

    console.log('[Firebase] ✅ Fully initialized and ready');
    return { app: _app, auth: _auth, db: _db, ready: true };

  } catch (err) {
    console.error('[Firebase] ❌ Initialization failed:', err);
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

export function hideFirebaseDependentUI() {
  try {
    const required = document.querySelectorAll('[data-firebase-required]');
    required.forEach(el => { el.style.display = 'none'; });

    const fallbacks = document.querySelectorAll('[data-firebase-fallback]');
    fallbacks.forEach(el => { el.style.display = ''; });

    const generic = document.getElementById('firebase-fallback');
    if (generic) {
      generic.innerText = 'Some features are temporarily unavailable. Please refresh or try again later.';
      generic.style.display = '';
    }
  } catch (e) {
    console.warn('hideFirebaseDependentUI failed:', e && e.message);
  }
}