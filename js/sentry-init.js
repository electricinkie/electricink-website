/**
 * SENTRY ERROR MONITORING - Frontend
 * Captures JavaScript errors and sends to Sentry dashboard
 */

(function() {
  'use strict';

  // Sentry DSN (Data Source Name) - Add via environment variable or config
  const SENTRY_DSN = 'https://YOUR_SENTRY_DSN@sentry.io/YOUR_PROJECT_ID';
  const SENTRY_ENVIRONMENT = window.location.hostname === 'localhost' ? 'development' : 'production';

  // Only initialize if DSN is configured
  if (SENTRY_DSN && !SENTRY_DSN.includes('YOUR_SENTRY_DSN')) {
    try {
      // Load Sentry SDK
      const script = document.createElement('script');
      script.src = 'https://browser.sentry-cdn.com/7.91.0/bundle.min.js';
      script.integrity = 'sha384-UXhzhKw8KqKLPh5yGXwIqPMvfCjzhVhHzZLo5eUQl5NkxqYk0YWnqVbKqSdmQf/U';
      script.crossOrigin = 'anonymous';
      script.onload = function() {
        // Initialize Sentry
        if (window.Sentry) {
          window.Sentry.init({
            dsn: SENTRY_DSN,
            environment: SENTRY_ENVIRONMENT,
            
            // Track user sessions
            integrations: [
              new window.Sentry.BrowserTracing(),
              new window.Sentry.Replay({
                maskAllText: false,
                blockAllMedia: false,
              }),
            ],
            
            // Performance Monitoring
            tracesSampleRate: 1.0, // 100% in production, lower for scale
            
            // Session Replay
            replaysSessionSampleRate: 0.1, // 10% of sessions
            replaysOnErrorSampleRate: 1.0, // 100% on errors
            
            // Ignore common browser errors
            ignoreErrors: [
              'Non-Error promise rejection captured',
              'ResizeObserver loop limit exceeded',
              'SecurityError',
            ],
            
            // Additional context
            beforeSend(event, hint) {
              // Add cart info if error happens during checkout
              try {
                const cart = localStorage.getItem('electricink_cart');
                if (cart) {
                  event.contexts = event.contexts || {};
                  event.contexts.cart = {
                    items: JSON.parse(cart).length,
                  };
                }
              } catch (e) {
                // Ignore
              }
              
              return event;
            },
          });
          
          console.log('✅ Sentry error monitoring active');
        }
      };
      
      document.head.appendChild(script);
      
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  } else {
    console.log('⚠️ Sentry DSN not configured - error monitoring disabled');
  }
})();
