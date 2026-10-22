"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHourWindowString = getHourWindowString;
exports.getNextHourWindowDate = getNextHourWindowDate;
exports.startEmailWorker = startEmailWorker;
const bullmq_1 = require("bullmq");
const emailQueue_1 = require("../queues/emailQueue");
const redis_1 = require("../config/redis");
const prisma_1 = __importDefault(require("../config/prisma"));
const etherealService_1 = __importDefault(require("../services/etherealService"));
const slackService_1 = __importDefault(require("../services/slackService"));
const elasticsearchService_1 = __importDefault(require("../services/elasticsearchService"));
const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const defaultMinDelay = parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10);
/**
 * Helper to get standard hour window string: YYYY-MM-DD-HH
 */
function getHourWindowString(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    return `${y}-${m}-${d}-${h}`;
}
/**
 * Calculate the exact start of the next hour window (with 5s jitter)
 */
function getNextHourWindowDate(now = new Date()) {
    const nextHour = new Date(now.getTime());
    nextHour.setUTCMinutes(0, 5, 0); // 5 seconds past next hour
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    return nextHour;
}
function startEmailWorker() {
    console.log(`🚀 Starting BullMQ Email Worker with concurrency = ${concurrency}...`);
    const worker = new bullmq_1.Worker(emailQueue_1.EMAIL_QUEUE_NAME, async (job) => {
        const { emailJobId, senderEmail, recipientEmail, subject, body, hourlyLimit, delayBetweenEmailsMs = defaultMinDelay, } = job.data;
        console.log(`\n📨 [Worker] Processing Job ${job.id} for EmailJob: ${emailJobId} -> ${recipientEmail}`);
        // 1. Fetch DB record & verify idempotency
        const emailRecord = await prisma_1.default.emailJob.findUnique({
            where: { id: emailJobId },
        });
        if (!emailRecord) {
            console.warn(`⚠️ [Worker] EmailJob ${emailJobId} not found in database. Skipping.`);
            return { status: 'skipped', reason: 'record_not_found' };
        }
        // Idempotency: If already sent, do NOT re-send!
        if (emailRecord.status === 'SENT') {
            console.log(`ℹ️ [Worker] EmailJob ${emailJobId} is already marked SENT. Skipping to preserve idempotency.`);
            return { status: 'already_sent', emailJobId };
        }
        if (emailRecord.status === 'CANCELLED') {
            console.log(`ℹ️ [Worker] EmailJob ${emailJobId} was CANCELLED by user. Skipping.`);
            return { status: 'cancelled', emailJobId };
        }
        // 2. Minimum Delay Enforcement between individual email sends
        const lastSentKey = `last_send_timestamp:${senderEmail}`;
        const lastSentVal = await redis_1.redisClient.get(lastSentKey);
        if (lastSentVal) {
            const lastSentTime = parseInt(lastSentVal, 10);
            const elapsed = Date.now() - lastSentTime;
            if (elapsed < delayBetweenEmailsMs) {
                const waitTime = delayBetweenEmailsMs - elapsed;
                console.log(`⏳ [Worker] Enforcing provider throttling delay: waiting ${waitTime}ms for sender ${senderEmail}...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
        }
        // 3. Hourly Rate Limit Check (Multi-worker atomic Redis counter)
        const currentHourWindow = getHourWindowString();
        const rateLimitKey = `rate_limit:${senderEmail}:${currentHourWindow}`;
        // Increment counter atomically
        const currentCount = await redis_1.redisClient.incr(rateLimitKey);
        if (currentCount === 1) {
            // Set TTL to 2 hours
            await redis_1.redisClient.expire(rateLimitKey, 7200);
        }
        const limit = hourlyLimit || parseInt(process.env.DEFAULT_HOURLY_LIMIT_PER_SENDER || '50', 10);
        // Check if rate limit exceeded
        if (currentCount > limit) {
            console.warn(`🚨 [Worker] Sender ${senderEmail} exceeded rate limit! (Current: ${currentCount}, Limit: ${limit})`);
            // DO NOT DROP OR FAIL JOBS! Reschedule to next hour window
            const nextHour = getNextHourWindowDate();
            const delayToNextHour = Math.max(1000, nextHour.getTime() - Date.now());
            console.log(`🔄 [Worker] Rescheduling EmailJob ${emailJobId} to next hour window at ${nextHour.toISOString()} (in ${Math.round(delayToNextHour / 1000)}s)`);
            // Update DB record to RATE_LIMITED_RESCHEDULED
            await prisma_1.default.emailJob.update({
                where: { id: emailJobId },
                data: {
                    status: 'RATE_LIMITED_RESCHEDULED',
                    scheduledAt: nextHour,
                    attempts: { increment: 1 },
                },
            });
            // Add delayed job into BullMQ for the next hour window
            const newBullJob = await emailQueue_1.emailQueue.add(`email-${emailJobId}-rescheduled`, {
                ...job.data,
                attempt: (job.data.attempt || 1) + 1,
            }, {
                delay: delayToNextHour,
                jobId: `${emailJobId}-rescheduled-${currentHourWindow}`,
            });
            await prisma_1.default.emailJob.update({
                where: { id: emailJobId },
                data: { bullJobId: newBullJob.id },
            });
            // Trigger Slack Notification (debounced per hour window per sender)
            const alertLockKey = `slack_alert_sent:${senderEmail}:${currentHourWindow}`;
            const alreadyAlerted = await redis_1.redisClient.get(alertLockKey);
            if (!alreadyAlerted) {
                await redis_1.redisClient.set(alertLockKey, 'true', 'EX', 7200);
                // Record in DB rate limit log
                await prisma_1.default.rateLimitLog.upsert({
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
                // Dispatch live Slack notification!
                await slackService_1.default.sendRateLimitAlert({
                    senderEmail,
                    hourlyLimit: limit,
                    currentCount,
                    nextAvailableWindow: nextHour,
                });
            }
            // Update Elasticsearch status
            await elasticsearchService_1.default.updateEmailStatus(emailJobId, 'RATE_LIMITED_RESCHEDULED', {
                scheduledAt: nextHour.toISOString(),
            });
            return {
                status: 'rate_limited_rescheduled',
                emailJobId,
                rescheduledTo: nextHour.toISOString(),
            };
        }
        // 4. Rate limit check passed: Proceed with sending email!
        await prisma_1.default.emailJob.update({
            where: { id: emailJobId },
            data: {
                status: 'PROCESSING',
                attempts: { increment: 1 },
            },
        });
        try {
            const sendResult = await etherealService_1.default.sendEmail({
                from: senderEmail,
                to: recipientEmail,
                subject,
                text: body,
            });
            const now = new Date();
            // 5. Update DB to SENT with preview URL
            const updated = await prisma_1.default.emailJob.update({
                where: { id: emailJobId },
                data: {
                    status: 'SENT',
                    sentAt: now,
                    etherealMessageId: sendResult.messageId,
                    etherealPreviewUrl: sendResult.previewUrl || null,
                    lastError: null,
                },
            });
            // Update sender last sent timestamp in Redis for minimum delay throttling
            await redis_1.redisClient.set(lastSentKey, Date.now().toString());
            // Update Elasticsearch document
            await elasticsearchService_1.default.updateEmailStatus(emailJobId, 'SENT', {
                sentAt: now.toISOString(),
                etherealPreviewUrl: sendResult.previewUrl,
            });
            console.log(`🎉 [Worker] EmailJob ${emailJobId} sent successfully to ${recipientEmail}`);
            return {
                status: 'sent',
                emailJobId,
                messageId: sendResult.messageId,
                previewUrl: sendResult.previewUrl,
            };
        }
        catch (sendError) {
            console.error(`❌ [Worker] Failed to send email ${emailJobId}:`, sendError.message);
            // If max attempts reached, mark as FAILED
            const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
            const newStatus = isLastAttempt ? 'FAILED' : 'SCHEDULED';
            await prisma_1.default.emailJob.update({
                where: { id: emailJobId },
                data: {
                    status: newStatus,
                    lastError: sendError.message,
                },
            });
            await elasticsearchService_1.default.updateEmailStatus(emailJobId, newStatus, {
                lastError: sendError.message,
            });
            throw sendError; // Let BullMQ handle retry / backoff
        }
    }, {
        connection: redis_1.redisConnection,
        concurrency,
    });
    worker.on('ready', () => {
        console.log(`✅ BullMQ Email Worker is ready and listening for jobs.`);
    });
    worker.on('error', (err) => {
        console.error('❌ BullMQ Email Worker error:', err);
    });
    return worker;
}
