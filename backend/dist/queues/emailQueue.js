"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverAdapter = exports.queueEvents = exports.emailQueue = exports.EMAIL_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const api_1 = require("@bull-board/api");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express_1 = require("@bull-board/express");
const redis_1 = require("../config/redis");
exports.EMAIL_QUEUE_NAME = 'email-send-queue';
// Persistent BullMQ Queue
exports.emailQueue = new bullmq_1.Queue(exports.EMAIL_QUEUE_NAME, {
    connection: redis_1.redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: false, // Keep completed jobs visible on Bull-Board
        removeOnFail: false, // Keep failed jobs visible on Bull-Board
    },
});
// Queue Events listener for real-time monitoring and debug logs
exports.queueEvents = new bullmq_1.QueueEvents(exports.EMAIL_QUEUE_NAME, {
    connection: redis_1.redisConnection,
});
exports.queueEvents.on('waiting', ({ jobId }) => {
    console.log(`⏱️ Job ${jobId} is in waiting state`);
});
exports.queueEvents.on('delayed', ({ jobId, delay }) => {
    console.log(`⏳ Job ${jobId} delayed by ${delay}ms`);
});
exports.queueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Job ${jobId} completed successfully`);
});
exports.queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});
// Setup Live Bull-Board Dashboard
exports.serverAdapter = new express_1.ExpressAdapter();
exports.serverAdapter.setBasePath('/admin/queues');
(0, api_1.createBullBoard)({
    queues: [new bullMQAdapter_1.BullMQAdapter(exports.emailQueue)],
    serverAdapter: exports.serverAdapter,
});
