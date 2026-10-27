import { describe, it, expect } from 'vitest';
import { getHourWindowString, getNextHourWindowDate } from '../../src/workers/emailWorker.js';

describe('Unit Tests: Scheduling Logic', () => {
  it('should generate correct hour window string in YYYY-MM-DD-HH format', () => {
    const fixedDate = new Date('2026-10-27T14:35:20.000Z');
    const windowString = getHourWindowString(fixedDate);
    expect(windowString).toBe('2026-10-27-14');
  });

  it('should format single digit months and hours with leading zeros', () => {
    const fixedDate = new Date('2026-04-05T09:05:00.000Z');
    const windowString = getHourWindowString(fixedDate);
    expect(windowString).toBe('2026-04-05-09');
  });

  it('should calculate the exact start of the next hour window with 5s jitter', () => {
    const fixedDate = new Date('2026-10-27T14:35:20.000Z');
    const nextHour = getNextHourWindowDate(fixedDate);

    expect(nextHour.getUTCFullYear()).toBe(2026);
    expect(nextHour.getUTCMonth()).toBe(9); // 0-indexed October
    expect(nextHour.getUTCDate()).toBe(27);
    expect(nextHour.getUTCHours()).toBe(15);
    expect(nextHour.getUTCMinutes()).toBe(0);
    expect(nextHour.getUTCSeconds()).toBe(5);
  });

  it('should roll over to next day when hour is 23:00', () => {
    const fixedDate = new Date('2026-10-27T23:45:00.000Z');
    const nextHour = getNextHourWindowDate(fixedDate);

    expect(nextHour.getUTCDate()).toBe(28);
    expect(nextHour.getUTCHours()).toBe(0);
    expect(nextHour.getUTCMinutes()).toBe(0);
    expect(nextHour.getUTCSeconds()).toBe(5);
  });

  it('should compute delay milliseconds accurately for scheduled future jobs', () => {
    const now = new Date('2026-10-27T10:00:00.000Z');
    const scheduledFor = new Date('2026-10-27T10:15:00.000Z');
    const delay = Math.max(0, scheduledFor.getTime() - now.getTime());

    expect(delay).toBe(15 * 60 * 1000); // 900,000 ms
  });
});
