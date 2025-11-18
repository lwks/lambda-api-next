const LEVELS = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function formatLog(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }

  return JSON.stringify(entry);
}

function log(level, message, meta) {
  const serialized = formatLog(level, message, meta);
  switch (level) {
    case LEVELS.error:
      // eslint-disable-next-line no-console
      console.error(serialized);
      break;
    case LEVELS.warn:
      // eslint-disable-next-line no-console
      console.warn(serialized);
      break;
    case LEVELS.debug:
      // eslint-disable-next-line no-console
      console.debug(serialized);
      break;
    default:
      // eslint-disable-next-line no-console
      console.info(serialized);
  }
}

function debug(message, meta) {
  log(LEVELS.debug, message, meta);
}

function info(message, meta) {
  log(LEVELS.info, message, meta);
}

function warn(message, meta) {
  log(LEVELS.warn, message, meta);
}

function error(message, meta) {
  log(LEVELS.error, message, meta);
}

module.exports = {
  logger: {
    debug,
    info,
    warn,
    error,
  },
};
