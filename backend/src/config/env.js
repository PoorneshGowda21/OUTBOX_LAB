import dotenv from 'dotenv';
dotenv.config();

/**
 * Validate and export typed/sanitized configuration
 */
export function validateEnv() {
  const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '5000', 10),
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/reachinbox',
    REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    MIN_DELAY_BETWEEN_EMAILS_MS: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10),
    DEFAULT_HOURLY_LIMIT_PER_SENDER: parseInt(process.env.DEFAULT_HOURLY_LIMIT_PER_SENDER || '50', 10),
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
    ELASTICSEARCH_NODE: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FORMAT: process.env.LOG_FORMAT || 'text',
  };

  return config;
}

export const env = validateEnv();
export default env;
