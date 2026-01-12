import { initFirebase } from './firebase-config.js';

window.addEventListener('DOMContentLoaded', function() {
  // Initialize Firebase early so the auth observer can restore session quickly.
  // Use a silent catch so this is safe in environments without FIREBASE_CONFIG.
  try { initFirebase().catch(() => {}); } catch (e) { /* ignore */ }

  if (window.showCookieConsentToast) {
    window.showCookieConsentToast();
  }
});
