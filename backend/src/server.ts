import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/api';
import { serverAdapter } from './queues/emailQueue';
import { startEmailWorker } from './workers/emailWorker';
import etherealService from './services/etherealService';
import elasticsearchService from './services/elasticsearchService';
import prisma from './config/prisma';
import { redisClient } from './config/redis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Live BullMQ Dashboard mounted at /admin/queues
app.use('/admin/queues', serverAdapter.getRouter());

// REST API routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      bullBoard: '/admin/queues',
      elasticsearch: elasticsearchService.getStatus(),
    },
  });
});

// Start server and background workers
async function bootstrap() {
  try {
    console.log('----------------------------------------------------');
    console.log('🚀 ReachInbox Full-Stack Email Job Scheduler Backend');
    console.log('----------------------------------------------------');

    // 1. Check PostgreSQL
    console.log('🔍 Connecting to PostgreSQL database...');
    await prisma.$connect();
    console.log('✅ PostgreSQL connected successfully');

    // 2. Check Redis
    console.log('🔍 Checking Redis connectivity...');
    await redisClient.ping();
    console.log('✅ Redis is ready for BullMQ queues and atomic rate limiting');

    // 3. Initialize Ethereal SMTP Fake Account
    await etherealService.initialize();

    // 4. Initialize Elasticsearch
    await elasticsearchService.initialize();

    // 5. Start BullMQ Worker
    const worker = startEmailWorker();

    // 6. Start HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`\n🎉 Server running on http://localhost:${PORT}`);
      console.log(`📊 Live BullMQ Dashboard: http://localhost:${PORT}/admin/queues`);
      console.log(`📡 API Endpoints available at http://localhost:${PORT}/api\n`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Gracefully shutting down ReachInbox Scheduler...');
      await worker.close();
      await prisma.$disconnect();
      server.close(() => {
        console.log('👋 Server closed. Goodbye!');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err: any) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
