"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = exports.redisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 100, 3000),
};
// Connection specifically for BullMQ
exports.redisConnection = new ioredis_1.default(redisConfig);
// Connection for atomic rate limiting, locking, and caching
exports.redisClient = new ioredis_1.default(redisConfig);
exports.redisConnection.on('connect', () => {
    console.log('✅ BullMQ Redis connected');
});
exports.redisConnection.on('error', (err) => {
    console.error('❌ BullMQ Redis connection error:', err.message);
});
exports.redisClient.on('connect', () => {
    console.log('✅ Application Redis client connected');
});
exports.redisClient.on('error', (err) => {
    console.error('❌ Redis client connection error:', err.message);
});
