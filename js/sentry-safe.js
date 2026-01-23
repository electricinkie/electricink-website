(function(){
  'use strict';

  // Secure Sentry bootstrap for pages that need client-side error reporting
  // - Do NOT instrument fetch/XHR to avoid interfering with Stripe
  // - Ignore errors that clearly originate from Stripe SDK
  // - Sanitize common sensitive fields

  function getDsn() {
    try {
      const meta = document.querySelector('meta[name="sentry-dsn"]');
      if (meta && meta.content && meta.content.trim()) return meta.content.trim();
    } catch (e) {}
    return window.__SENTRY_DSN__ || window.SENTRY_DSN || '';
  }

  const DSN = getDsn();
  if (!DSN) {
    // No DSN configured; nothing to do
    return;
  }

  // Load Sentry browser bundle (deferred) and initialize safely
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js';
  script.crossOrigin = 'anonymous';

  script.addEventListener('load', function() {
    try {
      if (!window.Sentry || typeof window.Sentry.init !== 'function') {
        console.warn('Sentry bundle loaded but Sentry.init not available');
        return;
      }

      // Minimal sanitizer: redact tokens, client secrets, emails (show domain only)
      function sanitizeEvent(event) {
        try {
          const redact = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach((k) => {
              const v = obj[k];
              const lower = k.toLowerCase();
              if (lower.includes('secret') || lower.includes('token') || lower.includes('password') || lower.includes('client_secret') || lower.includes('authorization')) {
                obj[k] = '[REDACTED]';
                return;
              }
              if (lower.includes('email') && typeof v === 'string') {
                const parts = v.split('@');
                if (parts.length === 2) obj[k] = '***@' + parts[1];
                return;
              }
              if (typeof v === 'object') redact(v);
            });
          };

          if (event.request && event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['stripe-signature'];
          }
          if (event.extra) redact(event.extra);
          if (event.contexts) redact(event.contexts);
          if (event.user) redact(event.user);
          if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
            event.breadcrumbs.forEach(b => { if (b && b.data) redact(b.data); });
          }
        } catch (e) {
          // never throw from sanitizer
          console.warn('sentry-safe sanitizer error', e && e.message);
        }
        return event;
      }

      window.Sentry.init({
        dsn: DSN,
        environment: (window.location.hostname.includes('vercel.app') ? 'preview' : 'production'),
        // IMPORTANT: do NOT trace fetch/XHR to avoid interfering with Stripe
        integrations: [
          // If BrowserTracing exists on bundle, disable fetch/xhr tracing
          (window.Sentry.BrowserTracing) ? new window.Sentry.BrowserTracing({ traceFetch: false, traceXHR: false }) : undefined
        ],
        beforeSend(event) {
          try {
            // Ignore events mentioning the Stripe SDK to avoid duplicate noise
            const message = event.exception && event.exception.values && event.exception.values[0] && event.exception.values[0].value;
            if (typeof message === 'string' && message.toLowerCase().includes('stripe')) {
              return null;
            }
          } catch (e) {}

          return sanitizeEvent(event);
        }
      });

      console.log('✅ Sentry (safe) initialized');
    } catch (err) {
      console.error('❌ Error initializing safe Sentry', err);
    }
  });

  script.addEventListener('error', function() {
    console.error('❌ Failed to load Sentry bundle');
  });

  document.head.appendChild(script);
})();
