import { describe, expect, it } from 'vitest';
import { chartRangeDateBounds, tenantDateRangeMatch } from '../../src/utils/dashboardDateRange.js';

describe('chartRangeDateBounds', () => {
  it('month range starts on first day of current month', () => {
    const bounds = chartRangeDateBounds('month');
    expect(bounds.endKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bounds.startKey.endsWith('-01')).toBe(true);
    expect(bounds.startKey <= bounds.endKey).toBe(true);
  });

  it('year range spans 12 months ending today', () => {
    const bounds = chartRangeDateBounds('year');
    expect(bounds.startKey <= bounds.endKey).toBe(true);
    const startYear = Number(bounds.startKey.slice(0, 4));
    const endYear = Number(bounds.endKey.slice(0, 4));
    expect(endYear - startYear).toBeLessThanOrEqual(1);
  });
});

describe('tenantDateRangeMatch', () => {
  it('matches date or issueDate string fields', () => {
    const match = tenantDateRangeMatch('default', { startKey: '2026-08-01', endKey: '2026-08-31' });
    expect(match.tenantId).toBe('default');
    expect(match.$or).toEqual([
      { date: { $gte: '2026-08-01', $lte: '2026-08-31' } },
      { issueDate: { $gte: '2026-08-01', $lte: '2026-08-31' } },
    ]);
  });
});
