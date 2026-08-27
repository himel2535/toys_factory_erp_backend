import { describe, expect, it, vi } from 'vitest';
import { currentMonthPrefix, monthPrefixRange } from '../../src/utils/monthPrefix.js';
import { formatTimingLegs, timeNamed } from '../../src/utils/timing.js';

describe('monthPrefixRange', () => {
  it('uses string bounds instead of regex so YYYY-MM-DD dates can hit an index', () => {
    expect(monthPrefixRange('2026-08')).toEqual({ $gte: '2026-08', $lt: '2026-09' });
  });

  it('rolls the year in December', () => {
    expect(monthPrefixRange('2026-12')).toEqual({ $gte: '2026-12', $lt: '2027-01' });
  });

  it('matches the Asia/Dhaka business calendar month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    expect(currentMonthPrefix()).toBe('2026-08');
    vi.useRealTimers();
  });
});

describe('timeNamed', () => {
  it('records elapsed ms per named leg', async () => {
    const legs: Record<string, number> = {};
    const value = await timeNamed('salesAgg', async () => 7, legs);
    expect(value).toBe(7);
    expect(legs.salesAgg).toBeGreaterThanOrEqual(0);
    expect(formatTimingLegs(legs)).toContain('salesAgg=');
  });
});
