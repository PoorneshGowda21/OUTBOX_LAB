import { Queue, QueueEvents } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { redisConnection } from '../config/redis';

export const EMAIL_QUEUE_NAME = 'email-send-queue';

export interface EmailJobData {
  emailJobId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  hourlyLimit: number;
  delayBetweenEmailsMs: number;
  attempt?: number;
}

// Persistent BullMQ Queue
export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: false, // Keep completed jobs visible on Bull-Board
    removeOnFail: false,     // Keep failed jobs visible on Bull-Board
  },
});

// Queue Events listener for real-time monitoring and debug logs
export const queueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
});

queueEvents.on('waiting', ({ jobId }) => {
  console.log(`⏱️ Job ${jobId} is in waiting state`);
});

queueEvents.on('delayed', ({ jobId, delay }) => {
  console.log(`⏳ Job ${jobId} delayed by ${delay}ms`);
});

queueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ Job ${jobId} completed successfully`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});

// Setup Live Bull-Board Dashboard
export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
