/**
 * SENTRY ERROR TRACKING CONFIGURATION
 * Monitora erros no backend
 */

// Sentry initialization (optional - only if SENTRY_DSN is configured)
let Sentry = null;

try {
  // Only require Sentry if DSN is configured
  if (process.env.SENTRY_DSN) {
    Sentry = require('@sentry/node');
    
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
    });

    console.log('✅ Sentry initialized successfully');
  } else {
    console.log('ℹ️ Sentry DSN not configured - error tracking disabled');
  }
} catch (error) {
  console.warn('⚠️ Sentry initialization failed:', error.message);
  console.log('Continuing without error tracking...');
}

/**
 * Capture exception (safe to call even if Sentry is not initialized)
 */
function captureException(error, context = {}) {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('Error:', error, context);
  }
}

/**
 * Capture message (safe to call even if Sentry is not initialized)
 */
function captureMessage(message, level = 'info', context = {}) {
  if (Sentry) {
    Sentry.captureMessage(message, { level, extra: context });
  } else {
    console.log(`[${level.toUpperCase()}]`, message, context);
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
