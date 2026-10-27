import { describe, it, expect, vi } from 'vitest';
import { reserveSenderTransmissionSlot } from '../../src/workers/emailWorker.js';

describe('Unit Tests: Rate Limiting & Throttling Logic', () => {
  it('should reserve transmission slot with 0 wait time when no prior sends exist', async () => {
    const mockRedis = {
      eval: vi.fn().mockResolvedValue(0),
    };

    const waitTime = await reserveSenderTransmissionSlot(
      mockRedis,
      'outreach@reachinbox.ai',
      2000,
      1000000
    );

    expect(mockRedis.eval).toHaveBeenCalled();
    expect(waitTime).toBe(0);
  });

  it('should calculate sequential wait times for multiple concurrent calls', async () => {
    // Simulate Lua script execution in memory:
    let lastSlot = null;
    const mockRedis = {
      eval: vi.fn(async (script, keyCount, key, minDelay, now) => {
        let targetSlot = now;
        if (lastSlot && (lastSlot + minDelay) > now) {
          targetSlot = lastSlot + minDelay;
        }
        lastSlot = targetSlot;
        return targetSlot - now;
      }),
    };

    const minDelay = 2000;
    const now = 10000;

    // Simulate 3 concurrent worker reservations at the same millisecond
    const wait1 = await reserveSenderTransmissionSlot(mockRedis, 'sender@reachinbox.ai', minDelay, now);
    const wait2 = await reserveSenderTransmissionSlot(mockRedis, 'sender@reachinbox.ai', minDelay, now);
    const wait3 = await reserveSenderTransmissionSlot(mockRedis, 'sender@reachinbox.ai', minDelay, now);

    expect(wait1).toBe(0);     // First job executes immediately
    expect(wait2).toBe(2000);  // Second job waits 2000ms
    expect(wait3).toBe(4000);  // Third job waits 4000ms
  });

  it('should handle Lua execution failure gracefully with 0 fallback', async () => {
    const failingRedis = {
      eval: vi.fn().mockRejectedValue(new Error('Redis connection failure')),
    };

    const waitTime = await reserveSenderTransmissionSlot(
      failingRedis,
      'sender@reachinbox.ai',
      2000
    );

    expect(waitTime).toBe(0);
  });
});
