"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = __importDefault(require("./routes/api"));
const emailQueue_1 = require("./queues/emailQueue");
const emailWorker_1 = require("./workers/emailWorker");
const etherealService_1 = __importDefault(require("./services/etherealService"));
const elasticsearchService_1 = __importDefault(require("./services/elasticsearchService"));
const prisma_1 = __importDefault(require("./config/prisma"));
const redis_1 = require("./config/redis");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Enable CORS for frontend
app.use((0, cors_1.default)({
    origin: '*',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Live BullMQ Dashboard mounted at /admin/queues
app.use('/admin/queues', emailQueue_1.serverAdapter.getRouter());
// REST API routes
app.use('/api', api_1.default);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            bullBoard: '/admin/queues',
            elasticsearch: elasticsearchService_1.default.getStatus(),
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
        await prisma_1.default.$connect();
        console.log('✅ PostgreSQL connected successfully');
        // 2. Check Redis
        console.log('🔍 Checking Redis connectivity...');
        await redis_1.redisClient.ping();
        console.log('✅ Redis is ready for BullMQ queues and atomic rate limiting');
        // 3. Initialize Ethereal SMTP Fake Account
        await etherealService_1.default.initialize();
        // 4. Initialize Elasticsearch
        await elasticsearchService_1.default.initialize();
        // 5. Start BullMQ Worker
        const worker = (0, emailWorker_1.startEmailWorker)();
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
            await prisma_1.default.$disconnect();
            server.close(() => {
                console.log('👋 Server closed. Goodbye!');
                process.exit(0);
            });
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
    catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}
bootstrap();
