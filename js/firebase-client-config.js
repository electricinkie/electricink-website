// Firebase Client Configuration (non-module fallback)
// This script provides a fallback `window.FIREBASE_CONFIG` when no injected
// config is present. It is intentionally a classic script (no `import`) so it
// can be included via `<script src="/js/firebase-client-config.js" defer></script>`.
(function () {
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    console.info('Using injected window.FIREBASE_CONFIG');
    return;
  }

  // Fallback client config (committed for convenience in local/dev).
  // Replace via deploy-time injection in production to avoid key/rotation issues.
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyDNT3Ym7D7Ln7fSS3Z3kpADhJ__TrYltBc",
    authDomain: "electricink-ie.firebaseapp.com",
    projectId: "electricink-ie",
    storageBucket: "electricink-ie.firebasestorage.app",
    messagingSenderId: "847780382940",
    appId: "1:847780382940:web:10e4f5911bfc06c67dcc19",
    measurementId: "G-F7K2B1EJYH"
  };

  console.warn('No injected FIREBASE_CONFIG found; using fallback config from js/firebase-client-config.js.\nConsider injecting config at deploy time and avoid committing API keys.');
})();
