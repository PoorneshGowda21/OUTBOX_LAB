import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/config/prisma.js', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $connect: vi.fn().mockResolvedValue(true),
    $disconnect: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/config/redis.js', () => ({
  redisClient: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  redisConnection: {},
}));

vi.mock('../../src/queues/emailQueue.js', () => ({
  serverAdapter: {
    getRouter: () => (req, res, next) => next(),
  },
  emailQueue: {
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    }),
  },
}));

vi.mock('../../src/services/elasticsearchService.js', () => ({
  default: {
    getStatus: () => ({ status: 'mock_connected' }),
    initialize: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/services/etherealService.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/workers/emailWorker.js', () => ({
  startEmailWorker: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

process.env.NODE_ENV = 'test';
import app from '../../src/server.js';

describe('Integration Tests: Health & Observability Endpoints', () => {
  it('GET /health should return 200 with status healthy and service status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database).toBe('connected');
    expect(res.body.checks.redis).toBe('connected');
    expect(res.body.checks.queue.status).toBe('healthy');
  });

  it('GET /api/health should return identical deep status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
