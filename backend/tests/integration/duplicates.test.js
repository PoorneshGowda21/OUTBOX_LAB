import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing processEmailJob
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
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    eval: vi.fn().mockResolvedValue(0),
  },
  redisConnection: {},
}));

vi.mock('../../src/services/etherealService.js', () => ({
  default: {
    sendEmail: vi.fn().mockResolvedValue({
      messageId: '<test-message-id@reachinbox.ai>',
      previewUrl: 'https://ethereal.email/message/test',
    }),
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
import etherealService from '../../src/services/etherealService.js';
import { processEmailJob } from '../../src/workers/emailWorker.js';

describe('Integration Tests: Duplicate Prevention & Crash Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Strict Idempotency: should NOT re-send an email if DB status is already SENT', async () => {
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-123',
      status: 'SENT',
      senderEmail: 'test@reachinbox.ai',
      recipientEmail: 'lead@example.com',
    });

    const job = {
      id: 'bull-job-1',
      data: {
        emailJobId: 'job-123',
        senderEmail: 'test@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const result = await processEmailJob(job);

    expect(result.status).toBe('already_sent');
    expect(etherealService.sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailJob.update).not.toHaveBeenCalled();
  });

  it('Skip Cancelled: should NOT send an email if DB status is CANCELLED', async () => {
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-cancelled-456',
      status: 'CANCELLED',
      senderEmail: 'test@reachinbox.ai',
      recipientEmail: 'lead@example.com',
    });

    const job = {
      id: 'bull-job-2',
      data: {
        emailJobId: 'job-cancelled-456',
        senderEmail: 'test@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const result = await processEmailJob(job);

    expect(result.status).toBe('cancelled');
    expect(etherealService.sendEmail).not.toHaveBeenCalled();
  });

  it('Crash-Window Recovery: Worker crash after SMTP accepts but before DB update should reconcile DB without re-sending', async () => {
    // Record is still PROCESSING in DB (because worker crashed before updating DB to SENT)
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-crash-789',
      status: 'PROCESSING',
      senderEmail: 'test@reachinbox.ai',
      recipientEmail: 'lead@example.com',
      idempotencyKey: 'idemp-key-789',
    });

    // But Redis sent_proof exists (proves SMTP accepted the email before crash)
    redisClient.get.mockImplementation((key) => {
      if (key === 'sent_proof:job-crash-789') {
        return Promise.resolve(
          JSON.stringify({
            messageId: '<idemp-key-789@reachinbox.ai>',
            previewUrl: 'https://ethereal.email/message/crash-recovery',
            sentAt: '2026-10-27T10:00:00.000Z',
          })
        );
      }
      return Promise.resolve(null);
    });

    const job = {
      id: 'bull-job-retry',
      data: {
        emailJobId: 'job-crash-789',
        senderEmail: 'test@reachinbox.ai',
        recipientEmail: 'lead@example.com',
        subject: 'Hello',
        body: 'World',
      },
      opts: { attempts: 3 },
      attemptsMade: 1,
    };

    const result = await processEmailJob(job);

    // Verified: No duplicate send to SMTP!
    expect(etherealService.sendEmail).not.toHaveBeenCalled();
    expect(result.status).toBe('recovered_sent');
    // Verified: Reconciled DB to SENT
    expect(prisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-crash-789' },
        data: expect.objectContaining({
          status: 'SENT',
          etherealMessageId: '<idemp-key-789@reachinbox.ai>',
        }),
      })
    );
  });
});
