// Firebase Client Configuration (non-module fallback)
// This script provides a fallback `window.FIREBASE_CONFIG` when no injected
// config is present. It is intentionally a classic script (no `import`) so it
// can be included via `<script src="/js/firebase-client-config.js" defer></script>`.
(function () {
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    console.info('Using injected window.FIREBASE_CONFIG');
    return;
  }

  // Try to load a single authoritative config at runtime from /firebase-config.json.
  // This lets us keep one file in the repo (firebase-config.json) and avoid
  // duplicating keys across multiple files. If fetch fails, fall back to the
  // embedded config so the site still works in environments without the file.
  async function loadRemoteOrFallback() {
    try {
      const resp = await fetch('/firebase-config.json', { cache: 'no-cache' });
      if (resp.ok) {
        const cfg = await resp.json();
        if (cfg && cfg.apiKey) {
          window.FIREBASE_CONFIG = cfg;
          console.info('Loaded FIREBASE_CONFIG from /firebase-config.json');
          return;
        }
      }
    } catch (err) {
      console.warn('Could not fetch /firebase-config.json — using embedded fallback', err);
    }

    // Embedded fallback (kept for local/dev convenience).
    window.FIREBASE_CONFIG = {
      apiKey: "AIzaSyC-90Ju-9xHSgO_CVeK4s3hDc0q_52KD1M",
      authDomain: "electricink-ie.firebaseapp.com",
      projectId: "electricink-ie",
      storageBucket: "electricink-ie.firebasestorage.app",
      messagingSenderId: "847780382940",
      appId: "1:847780382940:web:10e4f5911bfc06c67dcc19",
      measurementId: "G-F7K2B1EJYH"
    };

    console.warn('Using embedded FIREBASE_CONFIG fallback; consider provisioning /firebase-config.json at deploy time to keep a single source of truth.');
  }

  // Kick off loading (non-blocking). `firebase-config.js` will check window.FIREBASE_CONFIG when used.
  loadRemoteOrFallback();
  // Inject a small module to initialize Firebase early (sets persistence before other modules run)
  try {
    const bootScript = document.createElement('script');
    bootScript.type = 'module';
    bootScript.textContent = `
      import { initFirebase } from '/js/firebase-config.js';
      (async () => {
        try {
          const res = await initFirebase();
          if (res && res.ready) {
            console.info('[FB-BOOT] initFirebase ran early and set persistence');
          } else {
            console.warn('[FB-BOOT] initFirebase early run returned not-ready', res && res.error);
          }
        } catch (e) {
          console.warn('[FB-BOOT] initFirebase early failed', e);
        }
      })();
    `;
    document.head.appendChild(bootScript);
  } catch (e) {
    console.warn('Could not inject firebase early-init module:', e);
  }
})();
