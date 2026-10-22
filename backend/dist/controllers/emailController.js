"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailController = exports.EmailController = void 0;
const uuid_1 = require("uuid");
const prisma_1 = __importDefault(require("../config/prisma"));
const emailQueue_1 = require("../queues/emailQueue");
const elasticsearchService_1 = __importDefault(require("../services/elasticsearchService"));
const redis_1 = require("../config/redis");
const emailWorker_1 = require("../workers/emailWorker");
class EmailController {
    /**
     * Schedule one or more emails with staggering and delayed BullMQ jobs
     */
    async schedule(req, res) {
        try {
            const { senderEmail, recipients, subject, body, startTime, delayBetweenEmailsMs = 2000, hourlyLimit = 50, userId, } = req.body;
            if (!senderEmail || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
                res.status(400).json({ error: 'senderEmail and non-empty recipients array are required.' });
                return;
            }
            if (!subject || !body) {
                res.status(400).json({ error: 'subject and body are required.' });
                return;
            }
            // Ensure sender exists in DB
            let sender = await prisma_1.default.sender.findUnique({ where: { email: senderEmail } });
            if (!sender) {
                sender = await prisma_1.default.sender.create({
                    data: {
                        email: senderEmail,
                        name: senderEmail.split('@')[0],
                        hourlyLimit: Number(hourlyLimit) || 50,
                    },
                });
            }
            const baseStartTime = startTime ? new Date(startTime).getTime() : Date.now();
            const delayMs = Math.max(0, Number(delayBetweenEmailsMs) || 2000);
            const limit = Number(hourlyLimit) || sender.hourlyLimit || 50;
            const createdJobs = [];
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i].trim();
                if (!recipient)
                    continue;
                // Calculate staggered schedule time for this lead
                const scheduledTimeMs = baseStartTime + i * delayMs;
                const scheduledAt = new Date(scheduledTimeMs);
                const bullDelay = Math.max(0, scheduledTimeMs - Date.now());
                const idempotencyKey = `email_${senderEmail}_${recipient}_${scheduledTimeMs}_${(0, uuid_1.v4)().substring(0, 8)}`;
                // 1. Create DB record
                const emailRecord = await prisma_1.default.emailJob.create({
                    data: {
                        senderId: sender.id,
                        userId: userId || null,
                        senderEmail,
                        recipientEmail: recipient,
                        subject,
                        body,
                        status: 'SCHEDULED',
                        scheduledAt,
                        delayBetweenEmailsMs: delayMs,
                        hourlyLimit: limit,
                        idempotencyKey,
                    },
                });
                // 2. Add delayed job to BullMQ (Persisted in Redis, survives server restarts)
                const bullJob = await emailQueue_1.emailQueue.add(`send-email-${emailRecord.id}`, {
                    emailJobId: emailRecord.id,
                    senderEmail,
                    recipientEmail: recipient,
                    subject,
                    body,
                    hourlyLimit: limit,
                    delayBetweenEmailsMs: delayMs,
                }, {
                    delay: bullDelay,
                    jobId: emailRecord.id, // Idempotent BullMQ job ID
                });
                // Update with BullMQ job ID
                const updatedRecord = await prisma_1.default.emailJob.update({
                    where: { id: emailRecord.id },
                    data: { bullJobId: bullJob.id },
                });
                // 3. Index in Elasticsearch
                await elasticsearchService_1.default.indexEmail(updatedRecord);
                createdJobs.push(updatedRecord);
            }
            console.log(`✅ Scheduled ${createdJobs.length} emails from ${senderEmail} starting at ${new Date(baseStartTime).toISOString()}`);
            res.status(201).json({
                success: true,
                message: `Successfully scheduled ${createdJobs.length} emails.`,
                count: createdJobs.length,
                jobs: createdJobs,
            });
        }
        catch (err) {
            console.error('❌ Error scheduling emails:', err);
            res.status(500).json({ error: 'Failed to schedule emails', details: err.message });
        }
    }
    /**
     * Get list of scheduled / pending / rescheduled emails
     */
    async getScheduled(req, res) {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 20;
            const skip = (page - 1) * limit;
            const search = req.query.search || '';
            const where = {
                status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING', 'RATE_LIMITED_RESCHEDULED'] },
            };
            if (search) {
                where.OR = [
                    { recipientEmail: { contains: search, mode: 'insensitive' } },
                    { subject: { contains: search, mode: 'insensitive' } },
                    { senderEmail: { contains: search, mode: 'insensitive' } },
                ];
            }
            const [total, emails] = await Promise.all([
                prisma_1.default.emailJob.count({ where }),
                prisma_1.default.emailJob.findMany({
                    where,
                    orderBy: { scheduledAt: 'asc' },
                    skip,
                    take: limit,
                }),
            ]);
            res.json({
                success: true,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                emails,
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to retrieve scheduled emails', details: err.message });
        }
    }
    /**
     * Get list of sent / failed emails
     */
    async getSent(req, res) {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 20;
            const skip = (page - 1) * limit;
            const search = req.query.search || '';
            const status = req.query.status;
            const where = {
                status: status ? status : { in: ['SENT', 'FAILED'] },
            };
            if (search) {
                where.OR = [
                    { recipientEmail: { contains: search, mode: 'insensitive' } },
                    { subject: { contains: search, mode: 'insensitive' } },
                    { senderEmail: { contains: search, mode: 'insensitive' } },
                ];
            }
            const [total, emails] = await Promise.all([
                prisma_1.default.emailJob.count({ where }),
                prisma_1.default.emailJob.findMany({
                    where,
                    orderBy: { sentAt: 'desc' },
                    skip,
                    take: limit,
                }),
            ]);
            res.json({
                success: true,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                emails,
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to retrieve sent emails', details: err.message });
        }
    }
    /**
     * Cancel a scheduled email
     */
    async cancel(req, res) {
        try {
            const { id } = req.params;
            const email = await prisma_1.default.emailJob.findUnique({ where: { id } });
            if (!email) {
                res.status(404).json({ error: 'Email job not found' });
                return;
            }
            if (email.status === 'SENT') {
                res.status(400).json({ error: 'Cannot cancel an email that is already sent' });
                return;
            }
            // Remove from BullMQ queue if possible
            if (email.bullJobId) {
                const job = await emailQueue_1.emailQueue.getJob(email.bullJobId);
                if (job) {
                    await job.remove();
                }
            }
            const updated = await prisma_1.default.emailJob.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });
            await elasticsearchService_1.default.updateEmailStatus(id, 'CANCELLED');
            res.json({ success: true, message: 'Email cancelled successfully', email: updated });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to cancel email', details: err.message });
        }
    }
    /**
     * Search emails across Elasticsearch or DB fallback
     */
    async search(req, res) {
        try {
            const query = req.query.q || '';
            const status = req.query.status;
            const limit = parseInt(req.query.limit, 10) || 20;
            const offset = parseInt(req.query.offset, 10) || 0;
            const results = await elasticsearchService_1.default.searchEmails({
                query,
                status,
                limit,
                offset,
            });
            res.json({
                success: true,
                query,
                ...results,
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Search failed', details: err.message });
        }
    }
    /**
     * Get dashboard metrics & rate limit statuses
     */
    async getStats(req, res) {
        try {
            const [scheduledCount, sentCount, failedCount, rescheduledCount] = await Promise.all([
                prisma_1.default.emailJob.count({
                    where: { status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING'] } },
                }),
                prisma_1.default.emailJob.count({ where: { status: 'SENT' } }),
                prisma_1.default.emailJob.count({ where: { status: 'FAILED' } }),
                prisma_1.default.emailJob.count({ where: { status: 'RATE_LIMITED_RESCHEDULED' } }),
            ]);
            // BullMQ counts
            const queueCounts = await emailQueue_1.emailQueue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed');
            // Senders and their current hour window consumption
            const senders = await prisma_1.default.sender.findMany({ where: { isActive: true } });
            const currentHourWindow = (0, emailWorker_1.getHourWindowString)();
            const sendersWithUsage = await Promise.all(senders.map(async (sender) => {
                const rateLimitKey = `rate_limit:${sender.email}:${currentHourWindow}`;
                const currentCountVal = await redis_1.redisClient.get(rateLimitKey);
                const currentHourSent = currentCountVal ? parseInt(currentCountVal, 10) : 0;
                return {
                    ...sender,
                    currentHourSent,
                    currentHourWindow,
                    remainingInHour: Math.max(0, sender.hourlyLimit - currentHourSent),
                    percentageUsed: Math.min(100, Math.round((currentHourSent / sender.hourlyLimit) * 100)),
                };
            }));
            res.json({
                success: true,
                stats: {
                    totalScheduled: scheduledCount,
                    totalSent: sentCount,
                    totalFailed: failedCount,
                    totalRescheduled: rescheduledCount,
                    queue: queueCounts,
                },
                senders: sendersWithUsage,
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
        }
    }
    /**
     * Get or create senders
     */
    async getSenders(req, res) {
        try {
            let senders = await prisma_1.default.sender.findMany({ orderBy: { createdAt: 'asc' } });
            // If no senders, seed default ReachInbox senders
            if (senders.length === 0) {
                senders = await prisma_1.default.$transaction([
                    prisma_1.default.sender.create({
                        data: { email: 'growth@reachinbox.ai', name: 'ReachInbox Growth', hourlyLimit: 50 },
                    }),
                    prisma_1.default.sender.create({
                        data: { email: 'alex@reachinbox.ai', name: 'Alex Outreach', hourlyLimit: 30 },
                    }),
                    prisma_1.default.sender.create({
                        data: { email: 'sarah@reachinbox.ai', name: 'Sarah Partnerships', hourlyLimit: 25 },
                    }),
                ]);
            }
            res.json({ success: true, senders });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to retrieve senders', details: err.message });
        }
    }
    async createSender(req, res) {
        try {
            const { email, name, hourlyLimit = 50 } = req.body;
            if (!email || !name) {
                res.status(400).json({ error: 'email and name are required' });
                return;
            }
            const sender = await prisma_1.default.sender.upsert({
                where: { email },
                update: { name, hourlyLimit: Number(hourlyLimit) },
                create: { email, name, hourlyLimit: Number(hourlyLimit) },
            });
            res.status(201).json({ success: true, sender });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create sender', details: err.message });
        }
    }
}
exports.EmailController = EmailController;
exports.emailController = new EmailController();
exports.default = exports.emailController;
