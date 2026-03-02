import { initFirebase } from './firebase-config.js';

window.addEventListener('DOMContentLoaded', function() {
  try { initFirebase().catch(() => {}); } catch (e) { /* ignore */ }

  if (window.showCookieConsentToast) {
    window.showCookieConsentToast();
  }
});
