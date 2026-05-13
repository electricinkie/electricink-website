// Minimal stub - webhook handles all email logic
const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.log };

module.exports = async function handler(req, res) {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('[API/EMAILS] Stub handler - use webhook for emails');
  }
  
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://electricink.ie');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  
  return res.status(200).json({ 
    success: true, 
    message: 'Email functionality handled by webhook' 
  });
};