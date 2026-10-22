import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { emailQueue } from '../queues/emailQueue';
import elasticsearchService from '../services/elasticsearchService';
import { redisClient } from '../config/redis';
import { getHourWindowString } from '../workers/emailWorker';

export class EmailController {
  /**
   * Schedule one or more emails with staggering and delayed BullMQ jobs
   */
  public async schedule(req: Request, res: Response): Promise<void> {
    try {
      const {
        senderEmail,
        recipients,
        subject,
        body,
        startTime,
        delayBetweenEmailsMs = 2000,
        hourlyLimit = 50,
        userId,
      } = req.body;

      if (!senderEmail || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        res.status(400).json({ error: 'senderEmail and non-empty recipients array are required.' });
        return;
      }

      if (!subject || !body) {
        res.status(400).json({ error: 'subject and body are required.' });
        return;
      }

      // Ensure sender exists in DB
      let sender = await prisma.sender.findUnique({ where: { email: senderEmail } });
      if (!sender) {
        sender = await prisma.sender.create({
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

      const createdJobs: any[] = [];

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i].trim();
        if (!recipient) continue;

        // Calculate staggered schedule time for this lead
        const scheduledTimeMs = baseStartTime + i * delayMs;
        const scheduledAt = new Date(scheduledTimeMs);
        const bullDelay = Math.max(0, scheduledTimeMs - Date.now());
        const idempotencyKey = `email_${senderEmail}_${recipient}_${scheduledTimeMs}_${uuidv4().substring(0, 8)}`;

        // 1. Create DB record
        const emailRecord = await prisma.emailJob.create({
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
        const bullJob = await emailQueue.add(
          `send-email-${emailRecord.id}`,
          {
            emailJobId: emailRecord.id,
            senderEmail,
            recipientEmail: recipient,
            subject,
            body,
            hourlyLimit: limit,
            delayBetweenEmailsMs: delayMs,
          },
          {
            delay: bullDelay,
            jobId: emailRecord.id, // Idempotent BullMQ job ID
          }
        );

        // Update with BullMQ job ID
        const updatedRecord = await prisma.emailJob.update({
          where: { id: emailRecord.id },
          data: { bullJobId: bullJob.id },
        });

        // 3. Index in Elasticsearch
        await elasticsearchService.indexEmail(updatedRecord);

        createdJobs.push(updatedRecord);
      }

      console.log(`✅ Scheduled ${createdJobs.length} emails from ${senderEmail} starting at ${new Date(baseStartTime).toISOString()}`);

      res.status(201).json({
        success: true,
        message: `Successfully scheduled ${createdJobs.length} emails.`,
        count: createdJobs.length,
        jobs: createdJobs,
      });
    } catch (err: any) {
      console.error('❌ Error scheduling emails:', err);
      res.status(500).json({ error: 'Failed to schedule emails', details: err.message });
    }
  }

  /**
   * Get list of scheduled / pending / rescheduled emails
   */
  public async getScheduled(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const skip = (page - 1) * limit;
      const search = (req.query.search as string) || '';

      const where: any = {
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
        prisma.emailJob.count({ where }),
        prisma.emailJob.findMany({
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
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve scheduled emails', details: err.message });
    }
  }

  /**
   * Get list of sent / failed emails
   */
  public async getSent(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const skip = (page - 1) * limit;
      const search = (req.query.search as string) || '';
      const status = req.query.status as string;

      const where: any = {
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
        prisma.emailJob.count({ where }),
        prisma.emailJob.findMany({
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
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve sent emails', details: err.message });
    }
  }

  /**
   * Cancel a scheduled email
   */
  public async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const email = await prisma.emailJob.findUnique({ where: { id } });
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
        const job = await emailQueue.getJob(email.bullJobId);
        if (job) {
          await job.remove();
        }
      }

      const updated = await prisma.emailJob.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      await elasticsearchService.updateEmailStatus(id, 'CANCELLED');

      res.json({ success: true, message: 'Email cancelled successfully', email: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to cancel email', details: err.message });
    }
  }

  /**
   * Search emails across Elasticsearch or DB fallback
   */
  public async search(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q as string) || '';
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const results = await elasticsearchService.searchEmails({
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
    } catch (err: any) {
      res.status(500).json({ error: 'Search failed', details: err.message });
    }
  }

  /**
   * Get dashboard metrics & rate limit statuses
   */
  public async getStats(req: Request, res: Response): Promise<void> {
    try {
      const [scheduledCount, sentCount, failedCount, rescheduledCount] = await Promise.all([
        prisma.emailJob.count({
          where: { status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING'] } },
        }),
        prisma.emailJob.count({ where: { status: 'SENT' } }),
        prisma.emailJob.count({ where: { status: 'FAILED' } }),
        prisma.emailJob.count({ where: { status: 'RATE_LIMITED_RESCHEDULED' } }),
      ]);

      // BullMQ counts
      const queueCounts = await emailQueue.getJobCounts(
        'waiting',
        'delayed',
        'active',
        'completed',
        'failed'
      );

      // Senders and their current hour window consumption
      const senders = await prisma.sender.findMany({ where: { isActive: true } });
      const currentHourWindow = getHourWindowString();

      const sendersWithUsage = await Promise.all(
        senders.map(async (sender) => {
          const rateLimitKey = `rate_limit:${sender.email}:${currentHourWindow}`;
          const currentCountVal = await redisClient.get(rateLimitKey);
          const currentHourSent = currentCountVal ? parseInt(currentCountVal, 10) : 0;
          return {
            ...sender,
            currentHourSent,
            currentHourWindow,
            remainingInHour: Math.max(0, sender.hourlyLimit - currentHourSent),
            percentageUsed: Math.min(100, Math.round((currentHourSent / sender.hourlyLimit) * 100)),
          };
        })
      );

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
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
    }
  }

  /**
   * Get or create senders
   */
  public async getSenders(req: Request, res: Response): Promise<void> {
    try {
      let senders = await prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
      
      // If no senders, seed default ReachInbox senders
      if (senders.length === 0) {
        senders = await prisma.$transaction([
          prisma.sender.create({
            data: { email: 'growth@reachinbox.ai', name: 'ReachInbox Growth', hourlyLimit: 50 },
          }),
          prisma.sender.create({
            data: { email: 'alex@reachinbox.ai', name: 'Alex Outreach', hourlyLimit: 30 },
          }),
          prisma.sender.create({
            data: { email: 'sarah@reachinbox.ai', name: 'Sarah Partnerships', hourlyLimit: 25 },
          }),
        ]);
      }

      res.json({ success: true, senders });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve senders', details: err.message });
    }
  }

  public async createSender(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, hourlyLimit = 50 } = req.body;
      if (!email || !name) {
        res.status(400).json({ error: 'email and name are required' });
        return;
      }

      const sender = await prisma.sender.upsert({
        where: { email },
        update: { name, hourlyLimit: Number(hourlyLimit) },
        create: { email, name, hourlyLimit: Number(hourlyLimit) },
      });

      res.status(201).json({ success: true, sender });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create sender', details: err.message });
    }
  }
}

export const emailController = new EmailController();
export default emailController;
