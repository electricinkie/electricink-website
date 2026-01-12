import { initFirebase } from './firebase-config.js';

window.addEventListener('DOMContentLoaded', function() {
  // Initialize Firebase early so the auth observer can restore session quickly.
  // Use a silent catch so this is safe in environments without FIREBASE_CONFIG.
  try { initFirebase().catch(() => {}); } catch (e) { /* ignore */ }

  if (window.showCookieConsentToast) {
    window.showCookieConsentToast();
  }
  // Ensure hero video attempts to autoplay (muted + playsInline required by many browsers)
  try {
    const v = document.querySelector('.hero-video');
    if (v) {
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('webkit-playsinline', 'true');
      // Attempt to play; some browsers may still block and return a rejected promise
      v.play().catch(err => {
        // Autoplay blocked — do nothing (optional: show a small play button)
        // console.log('Hero autoplay prevented:', err && err.message);
      });
    }
  } catch (e) {
    // ignore
  }
});
