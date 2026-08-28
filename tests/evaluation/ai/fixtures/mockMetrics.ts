import { vi } from 'vitest';

export const defaultTodaySales = { date: '2026-08-27', total: 12500 };
export const defaultLowStockCount = 14;
export const defaultDashboardKpi = {
  monthRevenue: 240000,
  monthSalesCount: 18,
  customerDue: 52000,
  lowStock: 14,
  pendingSales: 6,
  openLeadsCount: 4,
};
export const defaultTrendSeries = [
  { key: '2026-08-21', date: '2026-08-21', label: 'Aug 21', value: 800 },
  { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 1200 },
];

vi.mock('../../../../src/services/metrics/salesMetrics.js', () => ({
  getTodaySales: vi.fn(),
  getSalesTrend: vi.fn(),
  getRevenueTrend: vi.fn(),
}));

vi.mock('../../../../src/services/metrics/inventoryMetrics.js', () => ({
  getLowStockCount: vi.fn(),
}));

vi.mock('../../../../src/services/metrics/dashboardMetrics.js', () => ({
  getDashboardSummaryMetrics: vi.fn(),
}));

import { getTodaySales, getSalesTrend, getRevenueTrend } from '../../../../src/services/metrics/salesMetrics.js';
import { getLowStockCount } from '../../../../src/services/metrics/inventoryMetrics.js';
import { getDashboardSummaryMetrics } from '../../../../src/services/metrics/dashboardMetrics.js';

export function resetMetricMocks(): void {
  vi.mocked(getTodaySales).mockReset();
  vi.mocked(getSalesTrend).mockReset();
  vi.mocked(getRevenueTrend).mockReset();
  vi.mocked(getLowStockCount).mockReset();
  vi.mocked(getDashboardSummaryMetrics).mockReset();
}

export function applyDefaultMetricMocks(): void {
  vi.mocked(getTodaySales).mockResolvedValue(defaultTodaySales);
  vi.mocked(getSalesTrend).mockResolvedValue(defaultTrendSeries);
  vi.mocked(getRevenueTrend).mockResolvedValue(defaultTrendSeries);
  vi.mocked(getLowStockCount).mockResolvedValue(defaultLowStockCount);
  vi.mocked(getDashboardSummaryMetrics).mockResolvedValue({
    payload: defaultDashboardKpi,
    legs: {},
  });
}
