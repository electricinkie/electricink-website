// Firebase Client Configuration
// Prefer injecting `window.FIREBASE_CONFIG` at runtime (hosting / deploy env).
// This file provides a fallback only when no injected config exists.
// Do NOT commit production secrets; use hosting provider environment variables
// or an injected <script> that sets `window.FIREBASE_CONFIG` before other scripts.

(function () {
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    console.info('Using injected window.FIREBASE_CONFIG');
    return;
  }

  // Fallback client config (committed for convenience in local/dev). Replace
  // via deploy-time injection in production to avoid key/rotation issues.
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyA2dRwr1Q-qYevDM9ODeor7wPD4UJFk-8Q",
    authDomain: "electricink-ie.firebaseapp.com",
    projectId: "electricink-ie",
    storageBucket: "electricink-ie.firebasestorage.app",
    messagingSenderId: "847780382940",
    appId: "1:847780382940:web:1864f5911bfc06c67dcc19",
    measurementId: "G-F7X261EJYH"
  };

  console.warn('No injected FIREBASE_CONFIG found; using fallback config from js/firebase-client-config.js.\nConsider injecting config at deploy time and avoid committing API keys.');
})();
