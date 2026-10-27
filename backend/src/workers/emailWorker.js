import { Worker } from 'bullmq';
import { EMAIL_QUEUE_NAME, emailQueue } from '../queues/emailQueue.js';
import { redisConnection, redisClient } from '../config/redis.js';
import prisma from '../config/prisma.js';
import etherealService from '../services/etherealService.js';
import slackService from '../services/slackService.js';
import elasticsearchService from '../services/elasticsearchService.js';
import logger from '../utils/logger.js';

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const defaultMinDelay = parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10);

/**
 * Helper to get standard hour window string: YYYY-MM-DD-HH
 */
export function getHourWindowString(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Calculate the exact start of the next hour window (with 5s jitter)
 */
export function getNextHourWindowDate(now = new Date()) {
  const nextHour = new Date(now.getTime());
  nextHour.setUTCMinutes(0, 5, 0); // 5 seconds past next hour
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return nextHour;
}

/**
 * Atomically reserve a transmission timestamp slot for a sender to enforce minimum delay
 * across multiple concurrent workers safely without race conditions.
 */
export async function reserveSenderTransmissionSlot(client, senderEmail, minDelayMs, now = Date.now()) {
  const luaScript = `
    local key = KEYS[1]
    local minDelay = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])

    local lastSlot = redis.call('get', key)
    local targetSlot = now
    if lastSlot then
      local lastSlotNum = tonumber(lastSlot)
      if (lastSlotNum + minDelay) > now then
        targetSlot = lastSlotNum + minDelay
      end
    end

    redis.call('set', key, tostring(targetSlot), 'EX', 7200)
    return targetSlot - now
  `;

  try {
    const waitTime = await client.eval(luaScript, 1, `sender_slot:${senderEmail}`, minDelayMs, now);
    return Math.max(0, parseInt(waitTime, 10) || 0);
  } catch (err) {
    logger.warn('Failed to reserve sender transmission slot via Lua script, falling back', {
      error: err.message,
      senderEmail,
    });
    return 0;
  }
}

/**
 * Core job processor function (isolated for unit and integration testing)
 */
export async function processEmailJob(job) {
  const {
    emailJobId,
    senderEmail,
    recipientEmail,
    subject,
    body,
    hourlyLimit,
    delayBetweenEmailsMs = defaultMinDelay,
  } = job.data;

  logger.info(`Processing Job ${job.id} for EmailJob: ${emailJobId} -> ${recipientEmail}`, {
    jobId: job.id,
    emailJobId,
    senderEmail,
    recipientEmail,
  });

  // 1. Fetch DB record & verify idempotency
  const emailRecord = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
  });

  if (!emailRecord) {
    logger.warn(`EmailJob ${emailJobId} not found in database. Skipping.`, { emailJobId });
    return { status: 'skipped', reason: 'record_not_found' };
  }

  // Idempotency Check: If already sent in DB, do NOT re-send!
  if (emailRecord.status === 'SENT') {
    logger.info(`EmailJob ${emailJobId} is already marked SENT in DB. Skipping to preserve idempotency.`, {
      emailJobId,
    });
    return { status: 'already_sent', emailJobId };
  }

  if (emailRecord.status === 'CANCELLED') {
    logger.info(`EmailJob ${emailJobId} was CANCELLED by user. Skipping.`, { emailJobId });
    return { status: 'cancelled', emailJobId };
  }

  // 1b. Crash-Window Recovery Check:
  // If a previous worker crashed after provider accepted message but before DB update,
  // the sent_proof cache in Redis preserves the proof of dispatch.
  const sentProofKey = `sent_proof:${emailJobId}`;
  const existingProofRaw = await redisClient.get(sentProofKey);
  if (existingProofRaw) {
    try {
      const proof = JSON.parse(existingProofRaw);
      logger.info(`Detected crash-recovery state: EmailJob ${emailJobId} was already sent to provider! Reconciling DB.`, {
        emailJobId,
        messageId: proof.messageId,
      });

      // Reconcile DB to SENT without re-sending to SMTP provider!
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: new Date(proof.sentAt),
          etherealMessageId: proof.messageId,
          etherealPreviewUrl: proof.previewUrl || null,
          lastError: null,
        },
      });

      return {
        status: 'recovered_sent',
        emailJobId,
        messageId: proof.messageId,
        previewUrl: proof.previewUrl,
      };
    } catch (parseErr) {
      logger.warn(`Failed to parse sent_proof for ${emailJobId}: ${parseErr.message}`);
    }
  }

  // 2. Multi-Worker Concurrent Minimum Delay Enforcement via Atomic Slot Reservation
  const waitMs = await reserveSenderTransmissionSlot(
    redisClient,
    senderEmail,
    delayBetweenEmailsMs
  );

  if (waitMs > 0) {
    logger.info(`Enforcing provider throttling delay: waiting ${waitMs}ms for sender ${senderEmail}...`, {
      senderEmail,
      waitMs,
    });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // 3. Hourly Rate Limit Check (Multi-worker atomic Redis counter)
  const currentHourWindow = getHourWindowString();
  const rateLimitKey = `rate_limit:${senderEmail}:${currentHourWindow}`;

  // Increment counter atomically
  const currentCount = await redisClient.incr(rateLimitKey);
  if (currentCount === 1) {
    // Set TTL to 2 hours
    await redisClient.expire(rateLimitKey, 7200);
  }

  const limit = hourlyLimit || parseInt(process.env.DEFAULT_HOURLY_LIMIT_PER_SENDER || '50', 10);

  // Check if rate limit exceeded
  if (currentCount > limit) {
    logger.warn(`Sender ${senderEmail} exceeded rate limit! (Current: ${currentCount}, Limit: ${limit})`, {
      senderEmail,
      currentCount,
      limit,
    });

    // DO NOT DROP OR FAIL JOBS! Reschedule to next hour window
    const nextHour = getNextHourWindowDate();
    const delayToNextHour = Math.max(1000, nextHour.getTime() - Date.now());

    logger.info(`Rescheduling EmailJob ${emailJobId} to next hour window at ${nextHour.toISOString()}`, {
      emailJobId,
      nextHour: nextHour.toISOString(),
      delaySec: Math.round(delayToNextHour / 1000),
    });

    // Update DB record to RATE_LIMITED_RESCHEDULED
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'RATE_LIMITED_RESCHEDULED',
        scheduledAt: nextHour,
        attempts: { increment: 1 },
      },
    });

    // Add delayed job into BullMQ for the next hour window
    const newBullJob = await emailQueue.add(
      `email-${emailJobId}-rescheduled`,
      {
        ...job.data,
        attempt: (job.data.attempt || 1) + 1,
      },
      {
        delay: delayToNextHour,
        jobId: `${emailJobId}-rescheduled-${currentHourWindow}`,
      }
    );

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { bullJobId: newBullJob.id },
    });

    // Trigger Slack Notification (debounced per hour window per sender)
    const alertLockKey = `slack_alert_sent:${senderEmail}:${currentHourWindow}`;
    const alreadyAlerted = await redisClient.get(alertLockKey);

    if (!alreadyAlerted) {
      await redisClient.set(alertLockKey, 'true', 'EX', 7200);

      // Record in DB rate limit log
      await prisma.rateLimitLog.upsert({
        where: {
          senderEmail_hourWindow: {
            senderEmail,
            hourWindow: currentHourWindow,
          },
        },
        update: {
          sentCount: currentCount,
          limit,
          slackNotified: true,
          slackNotifiedAt: new Date(),
        },
        create: {
          senderEmail,
          hourWindow: currentHourWindow,
          sentCount: currentCount,
          limit,
          slackNotified: true,
          slackNotifiedAt: new Date(),
        },
      });

      // Dispatch live Slack notification
      await slackService.sendRateLimitAlert({
        senderEmail,
        hourlyLimit: limit,
        currentCount,
        nextAvailableWindow: nextHour,
      });
    }

    // Update Elasticsearch status
    await elasticsearchService.updateEmailStatus(emailJobId, 'RATE_LIMITED_RESCHEDULED', {
      scheduledAt: nextHour.toISOString(),
    });

    return {
      status: 'rate_limited_rescheduled',
      emailJobId,
      rescheduledTo: nextHour.toISOString(),
    };
  }

  // 4. Rate limit check passed: Mark as PROCESSING in DB
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
    },
  });

  try {
    // Generate deterministic RFC 5322 Message-ID to ensure provider-level downstream deduplication
    const deterministicMessageId = `<${emailRecord.idempotencyKey || emailJobId}@reachinbox.ai>`;

    const sendResult = await etherealService.sendEmail({
      from: senderEmail,
      to: recipientEmail,
      subject,
      text: body,
      messageId: deterministicMessageId,
    });

    const now = new Date();

    // 4b. Immediately record sent proof in Redis BEFORE DB update to eliminate the crash window!
    await redisClient.set(
      sentProofKey,
      JSON.stringify({
        messageId: sendResult.messageId || deterministicMessageId,
        previewUrl: sendResult.previewUrl || null,
        sentAt: now.toISOString(),
      }),
      'EX',
      86400 * 7 // Keep proof for 7 days
    );

    // 5. Update DB to SENT with preview URL
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: now,
        etherealMessageId: sendResult.messageId || deterministicMessageId,
        etherealPreviewUrl: sendResult.previewUrl || null,
        lastError: null,
      },
    });

    // Update Elasticsearch document
    await elasticsearchService.updateEmailStatus(emailJobId, 'SENT', {
      sentAt: now.toISOString(),
      etherealPreviewUrl: sendResult.previewUrl,
    });

    logger.info(`EmailJob ${emailJobId} sent successfully to ${recipientEmail}`, {
      emailJobId,
      recipientEmail,
      messageId: sendResult.messageId,
      previewUrl: sendResult.previewUrl,
    });

    return {
      status: 'sent',
      emailJobId,
      messageId: sendResult.messageId,
      previewUrl: sendResult.previewUrl,
    };
  } catch (sendError) {
    logger.error(`Failed to send email ${emailJobId}: ${sendError.message}`, {
      emailJobId,
      error: sendError.message,
    });

    // If max attempts reached, mark as FAILED
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts?.attempts || 3);
    const newStatus = isLastAttempt ? 'FAILED' : 'SCHEDULED';

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: newStatus,
        lastError: sendError.message,
      },
    });

    await elasticsearchService.updateEmailStatus(emailJobId, newStatus, {
      lastError: sendError.message,
    });

    throw sendError; // Let BullMQ handle retry / backoff
  }
}

export function startEmailWorker() {
  logger.info(`Starting BullMQ Email Worker with concurrency = ${concurrency}...`);

  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => processEmailJob(job),
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on('ready', () => {
    logger.info(`BullMQ Email Worker is ready and listening for jobs.`);
  });

  worker.on('error', (err) => {
    logger.error('BullMQ Email Worker error:', { error: err.message });
  });

  return worker;
}
