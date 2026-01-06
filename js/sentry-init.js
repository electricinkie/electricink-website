/**
 * SENTRY ERROR MONITORING - Frontend
 * Captures JavaScript errors and sends to Sentry dashboard
 */

(function() {
  'use strict';

  // Sentry configuration
  // Reads DSN from a <meta name="sentry-dsn"> tag, or from window.__SENTRY_DSN__ (injected at runtime).
  // Do NOT hardcode secrets in this file. Inject at build or runtime.
  function getSentryDsn() {
    try {
      const meta = document.querySelector('meta[name="sentry-dsn"]');
      if (meta && meta.content && meta.content.trim()) return meta.content.trim();
    } catch (e) {
      // ignore
    }
    if (window.__SENTRY_DSN__) return window.__SENTRY_DSN__;
    if (window.SENTRY_DSN) return window.SENTRY_DSN; // fallback
    return '';
  }

  const SENTRY_DSN = getSentryDsn();
  if (!SENTRY_DSN) {
    console.warn('⚠️ Sentry DSN not configured. Add <meta name="sentry-dsn" content="..."> in <head> or set window.__SENTRY_DSN__.');
    return;
  }

  // Load Sentry SDK (CDN bundle)
  (function loadSentry() {
    const script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js';
    script.crossOrigin = 'anonymous';

    script.addEventListener('load', function() {
      try {
        if (window.Sentry && typeof window.Sentry.init === 'function') {
          window.Sentry.init({
            dsn: SENTRY_DSN,
            environment: window.location.hostname.includes('vercel.app') ? 'preview' : 'production',
            sampleRate: 1.0,
            beforeSend(event) {
              try {
                const cart = localStorage.getItem('electricink_cart');
                if (cart) {
                  const cartData = JSON.parse(cart);
                  event.contexts = event.contexts || {};
                  event.contexts.cart = {
                    items: cartData.length,
                    total: cartData.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)
                  };
                }
              } catch (e) {
                // ignore
              }
              event.contexts = event.contexts || {};
              event.contexts.page = { url: window.location.href, referrer: document.referrer };
              return event;
            },
            ignoreErrors: [
              'ResizeObserver loop limit exceeded',
              'Non-Error promise rejection captured',
              'Network request failed',
              'Failed to fetch',
              'Load failed',
              'SecurityError'
            ]
          });
          console.log('✅ Sentry initialized successfully');
        } else {
          console.error('❌ Sentry object not available after loading bundle');
        }
      } catch (err) {
        console.error('❌ Error initializing Sentry', err);
      }
    });

    script.addEventListener('error', function() {
      console.error('❌ Failed to load Sentry SDK from CDN');
    });

    document.head.appendChild(script);
  })();
})();
