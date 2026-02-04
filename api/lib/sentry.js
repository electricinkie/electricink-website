/**
 * SENTRY ERROR TRACKING CONFIGURATION
 * Monitora erros no backend
 */

const logger = require('./logger');

// Sentry initialization (optional - only if SENTRY_DSN is configured)
let Sentry = null;

try {
  // Only require Sentry if DSN is configured
  if (process.env.SENTRY_DSN) {
    Sentry = require('@sentry/node');
    
    // Sanitize events before send to avoid leaking secrets/PII
    const sanitizeEvent = (event) => {
      try {
        const sanitize = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          Object.keys(obj).forEach((k) => {
            const v = obj[k];
            const lower = k.toLowerCase();

            // Remove or redact sensitive keys
            if (
              lower.includes('secret') ||
              lower.includes('password') ||
              lower.includes('token') ||
              lower.includes('client_secret') ||
              k === 'client_secret' ||
              k === 'clientSecret'
            ) {
              obj[k] = '[REDACTED]';
              return;
            }

            // Mask emails to show only domain
            if (lower.includes('email') && typeof v === 'string') {
              const parts = v.split('@');
              if (parts.length === 2) obj[k] = `***@${parts[1]}`;
              return;
            }

            // Recurse into nested objects/arrays
            if (typeof v === 'object') sanitize(v);
          });
        };

        // Sanitize request headers & query_string
        if (event.request) {
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['stripe-signature'];
          }
          if (event.request.query_string && typeof event.request.query_string === 'string') {
            event.request.query_string = event.request.query_string
              .replace(/token=[^&]*/gi, 'token=[REDACTED]')
              .replace(/key=[^&]*/gi, 'key=[REDACTED]');
          }
        }

        if (event.extra) sanitize(event.extra);
        if (event.contexts) sanitize(event.contexts);
        if (event.user) sanitize(event.user);
        if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
          event.breadcrumbs.forEach(b => { if (b && b.data) sanitize(b.data); });
        }
      } catch (e) {
        // Never throw from sanitizer
        // eslint-disable-next-line no-console
        logger.warn('Sentry sanitizer error', { error: e && e.message });
      }
      return event;
    };

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      // Lower sample rate to avoid noisy transaction capture in production
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
      beforeSend(event, hint) {
        return sanitizeEvent(event);
      }
    });

    logger.info('Sentry initialized successfully');
  } else {
    logger.info('Sentry DSN not configured - error tracking disabled');
  }
} catch (error) {
  logger.warn('Sentry initialization failed', { error: error && error.message });
}

/**
 * Capture exception (safe to call even if Sentry is not initialized)
 */
  function captureException(error, context = {}) {
  if (Sentry) {
      Sentry.withScope(scope => {
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            if (key === 'requestId') {
              scope.setTag('requestId', value);
            } else {
              scope.setExtra(key, value);
            }
          });
        }
        Sentry.captureException(error);
      });
  } else {
    logger.error('Error (Sentry disabled)', error, context);
  }
}

/**
 * Capture message (safe to call even if Sentry is not initialized)
 */
  function captureMessage(message, level = 'info', context = {}) {
  if (Sentry) {
      Sentry.withScope(scope => {
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            if (key === 'requestId') {
              scope.setTag('requestId', value);
            } else {
              scope.setExtra(key, value);
            }
          });
        }
        Sentry.captureMessage(message);
      });
  } else {
    logger[level] && logger[level](message, context);
  }
}

/**
 * Set user context
 */
function setUser(user) {
  if (Sentry) {
    Sentry.setUser(user);
  }
}

module.exports = {
  Sentry,
  captureException,
  captureMessage,
  setUser,
  isInitialized: () => !!Sentry,
};
