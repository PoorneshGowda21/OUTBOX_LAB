import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 100, 3000),
};

// Connection specifically for BullMQ
export const redisConnection = new Redis(redisConfig);

// Connection for atomic rate limiting, locking, and caching
export const redisClient = new Redis(redisConfig);

redisConnection.on('connect', () => {
  console.log('✅ BullMQ Redis connected');
});

redisConnection.on('error', (err) => {
  console.error('❌ BullMQ Redis connection error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Application Redis client connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis client connection error:', err.message);
});
