const isDev = process.env.NODE_ENV !== 'production';

const logger = {
  info: (message, data = {}) => {
    console.log(`[INFO] ${message}`, isDev ? data : '');
  },
  
  warn: (message, data = {}) => {
    console.warn(`[WARN] ${message}`, isDev ? data : '');
  },
  
  error: (message, error, data = {}) => {
    console.error(`[ERROR] ${message}`, {
      error: error.message,
      stack: isDev ? error.stack : undefined,
      ...data
    });
  },
  
  debug: (message, data = {}) => {
    if (isDev) console.log(`[DEBUG] ${message}`, data);
  }
};

module.exports = logger;
