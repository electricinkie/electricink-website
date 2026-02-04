const { Resend } = require('resend');
const logger = require('./logger');

let resendClient = null;
let initAttempted = false;

function initResend() {
  if (initAttempted) return resendClient;
  initAttempted = true;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'your-resend-api-key-here') {
    logger.error('RESEND_API_KEY not found');
    return null;
  }

  try {
    resendClient = new Resend(apiKey);
    logger.info('Resend initialized successfully');
    return resendClient;
  } catch (error) {
    logger.error('Resend initialization failed', error);
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
