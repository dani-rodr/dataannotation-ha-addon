const LEVELS = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

function createLogger(level) {
  const threshold = LEVELS[String(level || 'info').toLowerCase()] ?? LEVELS.info;

  const withTimestamp = (levelLabel, method, minLevel) => (...args) => {
    if (threshold <= minLevel) {
      method(`[${new Date().toISOString()}] ${levelLabel}`, ...args);
    }
  };

  return {
    debug: withTimestamp('[DEBUG]', console.log, LEVELS.debug),
    info: withTimestamp('[INFO]', console.log, LEVELS.info),
    warning: withTimestamp('[WARN]', console.warn, LEVELS.warning),
    error: withTimestamp('[ERROR]', console.error, LEVELS.error),
  };
}

module.exports = {
  createLogger,
};
