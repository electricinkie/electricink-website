/**
 * SENTRY ERROR MONITORING - Frontend
 * Captures JavaScript errors and sends to Sentry dashboard
 */

(function() {
  'use strict';

  // Sentry configuration
  const SENTRY_DSN = 'https://e37a9a8d6ef2ed1dc2d480dff0ec396b@o4510652553166848.ingest.de.sentry.io/4510652588228688';
  
  if (!SENTRY_DSN || SENTRY_DSN.includes('YOUR_SENTRY_DSN')) {
    console.warn('⚠️ Sentry DSN not configured');
    return;
  }

  // Load Sentry SDK
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = function() {
    // Initialize Sentry
    if (window.Sentry) {
      window.Sentry.init({
        dsn: SENTRY_DSN,
        integrations: [
          new window.Sentry.BrowserTracing(),
          new window.Sentry.Replay()
        ],
        tracesSampleRate: 1.0,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        environment: window.location.hostname.includes('vercel.app') ? 'preview' : 'production',
        beforeSend(event) {
          // Add cart info to errors
          try {
            const cart = localStorage.getItem('electricink_cart');
            if (cart) {
              const cartData = JSON.parse(cart);
              event.contexts = event.contexts || {};
              event.contexts.cart = {
                items: cartData.length,
                total: cartData.reduce((sum, item) => sum + (item.price * item.quantity), 0)
              };
            }
          } catch (e) {
            // Ignore cart parsing errors
          }
          return event;
        },
        ignoreErrors: [
          // Ignore common browser errors
          'ResizeObserver loop limit exceeded',
          'Non-Error promise rejection captured',
          'Network request failed',
          'SecurityError'
        ]
      });
      
      console.log('✅ Sentry initialized');
    }
  };
  
  script.onerror = function() {
    console.error('❌ Failed to load Sentry SDK');
  };
  
  document.head.appendChild(script);
})();
