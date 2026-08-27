import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addBusinessDays,
  businessDateKeyFromParts,
  getBusinessDateParts,
  getBusinessMonthPrefix,
  getBusinessTodayIso,
  toBusinessDateKey,
} from '../../src/utils/businessDate.js';
import { currentMonthPrefix } from '../../src/utils/monthPrefix.js';

describe('businessDate Asia/Dhaka', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns BD today at midnight start (UTC+6)', () => {
    vi.setSystemTime(new Date('2026-08-26T18:00:00.000Z'));
    expect(getBusinessTodayIso()).toBe('2026-08-27');
  });

  it('returns same BD day just before midnight', () => {
    vi.setSystemTime(new Date('2026-08-27T17:59:59.000Z'));
    expect(getBusinessTodayIso()).toBe('2026-08-27');
  });

  it('rolls to next BD day after midnight', () => {
    vi.setSystemTime(new Date('2026-08-27T18:00:00.000Z'));
    expect(getBusinessTodayIso()).toBe('2026-08-28');
  });

  it('uses business month prefix independent of server timezone', () => {
    vi.setSystemTime(new Date('2026-08-31T20:00:00.000Z'));
    expect(getBusinessMonthPrefix()).toBe('2026-09');
    expect(currentMonthPrefix()).toBe('2026-09');
  });

  it('handles month boundary at BD midnight', () => {
    vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
    expect(getBusinessTodayIso()).toBe('2026-09-01');
    expect(getBusinessMonthPrefix()).toBe('2026-09');
  });

  it('handles year boundary at BD midnight', () => {
    vi.setSystemTime(new Date('2025-12-31T18:00:00.000Z'));
    expect(getBusinessTodayIso()).toBe('2026-01-01');
    expect(getBusinessMonthPrefix()).toBe('2026-01');
  });

  it('addBusinessDays advances one calendar day in BD', () => {
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    const today = getBusinessDateParts();
    const tomorrow = addBusinessDays(today, 1);
    expect(businessDateKeyFromParts(tomorrow)).toBe('2026-08-28');
  });

  it('toBusinessDateKey passes through stored YYYY-MM-DD strings', () => {
    expect(toBusinessDateKey('2026-03-15')).toBe('2026-03-15');
    expect(toBusinessDateKey('2026-03-15T10:00:00.000Z')).toBe('2026-03-15');
  });

  it('toBusinessDateKey converts Date instant to BD calendar date', () => {
    expect(toBusinessDateKey(new Date('2026-08-26T20:00:00.000Z'))).toBe('2026-08-27');
  });

  it('is server-timezone independent for same UTC instant', () => {
    const instant = new Date('2026-01-15T20:30:00.000Z');
    vi.setSystemTime(instant);
    expect(getBusinessTodayIso(instant)).toBe('2026-01-16');
    expect(getBusinessTodayIso(instant)).toBe(getBusinessTodayIso(new Date(instant.getTime())));
  });
});
