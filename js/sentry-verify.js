/*
  Sentry Verify
  - Polls for window.Sentry and sends a test message when available.
  - Use this by including <script src="/js/sentry-verify.js"></script> after `sentry-init.js`.
*/
(function(){
  'use strict';

  const MAX_TRIES = 12;
  const INTERVAL_MS = 500;

  function getDsn() {
    try {
      const meta = document.querySelector('meta[name="sentry-dsn"]');
      if (meta && meta.content && meta.content.trim()) return meta.content.trim();
    } catch (e) {}
    return window.__SENTRY_DSN__ || window.SENTRY_DSN || '';
  }

  function sendTestMessage() {
    try {
      if (window.Sentry && typeof window.Sentry.captureMessage === 'function') {
        window.Sentry.captureMessage('Sentry client verification message', 'info');
        console.log('Sentry verify: test message sent');
        return true;
      }
    } catch (e) {
      console.error('Sentry verify: error sending test message', e);
    }
    return false;
  }

  function start() {
    const dsn = getDsn();
    if (!dsn) {
      console.warn('Sentry verify: no DSN configured (meta[name="sentry-dsn"] or window.__SENTRY_DSN__)');
      return;
    }

    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (sendTestMessage()) {
        clearInterval(id);
        return;
      }
      if (tries >= MAX_TRIES) {
        clearInterval(id);
        console.warn('Sentry verify: Sentry not available after waiting');
      }
    }, INTERVAL_MS);
  }

  // Auto-run after DOM ready so it can find the meta tag
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
