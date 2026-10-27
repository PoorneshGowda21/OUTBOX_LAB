import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma.js', () => ({
  default: {
    emailJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rateLimitLog: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../src/config/redis.js', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(0),
  },
  redisConnection: {},
}));

vi.mock('../../src/queues/emailQueue.js', () => ({
  EMAIL_QUEUE_NAME: 'email-dispatch-queue',
  emailQueue: {
    add: vi.fn().mockResolvedValue({ id: 'rescheduled-bull-job-1' }),
  },
}));

vi.mock('../../src/services/etherealService.js', () => ({
  default: {
    sendEmail: vi.fn(),
  },
}));

vi.mock('../../src/services/slackService.js', () => ({
  default: {
    sendRateLimitAlert: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/services/elasticsearchService.js', () => ({
  default: {
    updateEmailStatus: vi.fn().mockResolvedValue(true),
  },
}));

import prisma from '../../src/config/prisma.js';
import { redisClient } from '../../src/config/redis.js';
import { emailQueue } from '../../src/queues/emailQueue.js';
import etherealService from '../../src/services/etherealService.js';
import { processEmailJob } from '../../src/workers/emailWorker.js';

describe('Integration Tests: Retries & Rate Limit Rescheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Transient Failure: should keep status SCHEDULED when retries are remaining', async () => {
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-transient',
      status: 'SCHEDULED',
      senderEmail: 'test@reachinbox.ai',
      recipientEmail: 'lead@example.com',
    });

    etherealService.sendEmail.mockRejectedValue(new Error('SMTP Network Connection Timeout'));

    const job = {
      id: 'bull-job-attempt-1',
      data: {
        emailJobId: 'job-transient',
        senderEmail: 'test@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
      },
      opts: { attempts: 3 },
      attemptsMade: 0, // First attempt -> 2 attempts remaining
    };

    await expect(processEmailJob(job)).rejects.toThrow('SMTP Network Connection Timeout');

    expect(prisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-transient' },
        data: expect.objectContaining({
          status: 'SCHEDULED',
          lastError: 'SMTP Network Connection Timeout',
        }),
      })
    );
  });

  it('Permanent Failure: should update status to FAILED when maximum attempts are exhausted', async () => {
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-exhausted',
      status: 'PROCESSING',
      senderEmail: 'test@reachinbox.ai',
      recipientEmail: 'lead@example.com',
    });

    etherealService.sendEmail.mockRejectedValue(new Error('Recipient mailbox unavailable 550'));

    const job = {
      id: 'bull-job-attempt-3',
      data: {
        emailJobId: 'job-exhausted',
        senderEmail: 'test@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
      },
      opts: { attempts: 3 },
      attemptsMade: 2, // 3rd attempt is the last attempt (2 + 1 = 3)
    };

    await expect(processEmailJob(job)).rejects.toThrow('Recipient mailbox unavailable 550');

    expect(prisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-exhausted' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Recipient mailbox unavailable 550',
        }),
      })
    );
  });

  it('Rate Limit Exceeded: should reschedule into next hour window instead of dropping job', async () => {
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-rate-limited',
      status: 'SCHEDULED',
      senderEmail: 'spammer@reachinbox.ai',
      recipientEmail: 'lead@example.com',
    });

    // Simulate hourly counter exceeding limit (e.g. 51 emails sent against limit of 50)
    redisClient.incr.mockResolvedValue(51);

    const job = {
      id: 'bull-job-rl',
      data: {
        emailJobId: 'job-rate-limited',
        senderEmail: 'spammer@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
        hourlyLimit: 50,
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const result = await processEmailJob(job);

    expect(result.status).toBe('rate_limited_rescheduled');
    expect(etherealService.sendEmail).not.toHaveBeenCalled();
    expect(emailQueue.add).toHaveBeenCalled(); // Rescheduled into BullMQ
    expect(prisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-rate-limited' },
        data: expect.objectContaining({
          status: 'RATE_LIMITED_RESCHEDULED',
        }),
      })
    );
  });
});
