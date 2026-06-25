const LEVELS = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

function createLogger(level) {
  const threshold = LEVELS[String(level || 'info').toLowerCase()] ?? LEVELS.info;

  return {
    debug: (...args) => {
      if (threshold <= LEVELS.debug) {
        console.log('[DEBUG]', ...args);
      }
    },
    info: (...args) => {
      if (threshold <= LEVELS.info) {
        console.log('[INFO]', ...args);
      }
    },
    warning: (...args) => {
      if (threshold <= LEVELS.warning) {
        console.warn('[WARN]', ...args);
      }
    },
    error: (...args) => {
      if (threshold <= LEVELS.error) {
        console.error('[ERROR]', ...args);
      }
    },
  };
}

module.exports = {
  createLogger,
};
