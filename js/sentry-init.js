/**
 * SENTRY ERROR MONITORING - Frontend
 * Captures JavaScript errors and sends to Sentry dashboard
 */

(function() {
  'use strict';

  // Sentry configuration
  const SENTRY_DSN = 'https://e37a9a8d6ef2ed1dc2d480dff0ec396b@o4510652553166848.ingest.de.sentry.io/4510652588228688';
  
  if (!SENTRY_DSN || SENTRY_DSN.includes('SEU_DSN_AQUI')) {
    console.warn('⚠️ Sentry DSN not configured');
    return;
  }

  // Load Sentry SDK (basic bundle - sem tracing/replay)
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js';
  script.crossOrigin = 'anonymous';
  
  script.onload = function() {
    if (window.Sentry) {
      // Initialize Sentry (SEM BrowserTracing e Replay)
      window.Sentry.init({
        dsn: SENTRY_DSN,
        
        // Environment detection
        environment: window.location.hostname.includes('vercel.app') ? 'preview' : 'production',
        
        // Sample rate (100% dos erros)
        sampleRate: 1.0,
        
        // Add context to errors
        beforeSend(event) {
          // Add cart info if available
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
            // Ignore cart errors
          }
          
          // Add page info
          event.contexts = event.contexts || {};
          event.contexts.page = {
            url: window.location.href,
            referrer: document.referrer
          };
          
          return event;
        },
        
        // Ignore common browser noise
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
      console.error('❌ Sentry object not available');
    }
  };
  
  script.onerror = function() {
    console.error('❌ Failed to load Sentry SDK from CDN');
  };
  
  document.head.appendChild(script);
})();
