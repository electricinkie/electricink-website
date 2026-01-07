const isDev = process.env.NODE_ENV !== 'production';

function log(level, message, data = {}, error = null) {
  const logObj = {
    level,
    message,
    ...data,
    timestamp: new Date().toISOString(),
  };
  if (error) {
    logObj.error = error.message;
    if (isDev) logObj.stack = error.stack;
  }
  if (isDev) {
    // Dev: print as object for readability
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}] ${message}`, logObj);
  } else {
    // Prod: print as JSON for structured logs
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(logObj));
  }
}

const logger = {
  info: (message, data = {}) => log('info', message, data),
  warn: (message, data = {}) => log('warn', message, data),
  error: (message, error, data = {}) => log('error', message, data, error),
  debug: (message, data = {}) => { if (isDev) log('debug', message, data); },
};

module.exports = logger;
