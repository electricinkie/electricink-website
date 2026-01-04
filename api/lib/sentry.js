/**
 * SENTRY BACKEND INTEGRATION
 * Error monitoring for API routes
 */

const Sentry = require('@sentry/node');

// Initialize Sentry (only if DSN is configured)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 1.0,
    
    // Integrate with Vercel
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  });
  
  console.log('✅ Sentry backend monitoring initialized');
}

/**
 * Wrap API handler with Sentry error catching
 * Usage: module.exports = withSentry(handler);
 */
function withSentry(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      // Log to console
      console.error('❌ API Error:', error);
      
      // Send to Sentry if configured
      if (process.env.SENTRY_DSN) {
        Sentry.captureException(error, {
          contexts: {
            request: {
              url: req.url,
              method: req.method,
              headers: req.headers,
            },
          },
        });
        await Sentry.flush(2000);
      }
      
      // Return error to client
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  };
}

module.exports = {
  Sentry,
  withSentry,
};
