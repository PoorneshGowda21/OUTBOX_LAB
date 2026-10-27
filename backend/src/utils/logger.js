/**
 * Structured Logger for ReachInbox Scheduler
 * Supports JSON structured logging in production and formatted console logging in dev.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

const isJsonFormat = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  if (isJsonFormat) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }

  const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'DEBUG' ? '🔍' : 'ℹ️';
  return `[${timestamp}] [${level}] ${emoji} ${message}${metaString}`;
}

export const logger = {
  debug(message, meta) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, meta));
    }
  },
  info(message, meta) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, meta));
    }
  },
  warn(message, meta) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },
  error(message, meta) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', message, meta));
    }
  },
};

export default logger;
