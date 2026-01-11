const { Resend } = require('resend');

let resendClient = null;
let initAttempted = false;

function initResend() {
  if (initAttempted) return resendClient;
  initAttempted = true;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'your-resend-api-key-here') {
    console.warn('[RESEND] ⚠️  RESEND_API_KEY not configured - emails will not be sent');
    return null;
  }

  try {
    resendClient = new Resend(apiKey);
    console.log('[RESEND] ✅ Initialized successfully');
    return resendClient;
  } catch (error) {
    console.error('[RESEND] ❌ Failed to initialize:', error && error.message);
    return null;
  }
}

function getResend() {
  if (!resendClient && !initAttempted) initResend();
  return resendClient;
}

function isResendConfigured() {
  return getResend() !== null;
}

module.exports = {
  initResend,
  getResend,
  isResendConfigured
};
