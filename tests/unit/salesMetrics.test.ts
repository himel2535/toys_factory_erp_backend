import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/dashboardDataLoader.js', () => ({
  loadSharedSalesOrders: vi.fn(),
  loadSharedPosTransactions: vi.fn(),
  loadSharedInvoices: vi.fn(),
}));

vi.mock('../../src/utils/dashboardChartSeries.js', () => ({
  buildSalesTrendSeries: vi.fn(),
  buildRevenueTrendSeries: vi.fn(),
}));

import {
  loadSharedInvoices,
  loadSharedPosTransactions,
  loadSharedSalesOrders,
} from '../../src/services/dashboardDataLoader.js';
import {
  buildRevenueTrendSeries,
  buildSalesTrendSeries,
} from '../../src/utils/dashboardChartSeries.js';
import {
  getRevenueTrend,
  getSalesTrend,
  getTodaySales,
} from '../../src/services/metrics/salesMetrics.js';

describe('salesMetrics', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('getSalesTrend calls loaders with tenantId and range', async () => {
    const salesOrders = [{ dateKey: '2026-08-27', amount: 100 }];
    const posReceipts = [{ dateKey: '2026-08-27', amount: 50 }];
    const series = [{ key: '2026-08-27', date: '2026-08-27', label: 'Today', value: 150 }];

    vi.mocked(loadSharedSalesOrders).mockResolvedValue(salesOrders);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue(posReceipts);
    vi.mocked(buildSalesTrendSeries).mockReturnValue(series);

    const result = await getSalesTrend({ tenantId: 'tenantA', range: 'week' });

    expect(loadSharedSalesOrders).toHaveBeenCalledWith('tenantA', 'week');
    expect(loadSharedPosTransactions).toHaveBeenCalledWith('tenantA', 'week');
    expect(buildSalesTrendSeries).toHaveBeenCalledWith(salesOrders, posReceipts, 'week');
    expect(result).toEqual(series);
  });

  it('getRevenueTrend delegates to loader and chart builders', async () => {
    const invoices = [{ dateKey: '2026-08-27', amount: 200 }];
    const posReceipts = [{ dateKey: '2026-08-27', amount: 75 }];
    const series = [{ key: '2026-08-27', date: '2026-08-27', label: 'Today', value: 275 }];

    vi.mocked(loadSharedInvoices).mockResolvedValue(invoices);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue(posReceipts);
    vi.mocked(buildRevenueTrendSeries).mockReturnValue(series);

    const result = await getRevenueTrend({ tenantId: 'tenantB', range: 'month' });

    expect(loadSharedInvoices).toHaveBeenCalledWith('tenantB', 'month', { revenueOnly: true });
    expect(loadSharedPosTransactions).toHaveBeenCalledWith('tenantB', 'month');
    expect(buildRevenueTrendSeries).toHaveBeenCalledWith(invoices, posReceipts, 'month');
    expect(result).toEqual(series);
  });

  it('getTodaySales uses day range loaders and returns BD date key + sum', async () => {
    vi.setSystemTime(new Date('2026-08-26T18:00:00.000Z'));
    vi.mocked(loadSharedSalesOrders).mockResolvedValue([]);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue([]);
    vi.mocked(buildSalesTrendSeries).mockReturnValue([
      { key: '2026-08-27', date: '2026-08-27', label: 'Today', value: 250 },
    ]);

    const result = await getTodaySales({ tenantId: 'tenantA' });

    expect(loadSharedSalesOrders).toHaveBeenCalledWith('tenantA', 'day');
    expect(loadSharedPosTransactions).toHaveBeenCalledWith('tenantA', 'day');
    expect(buildSalesTrendSeries).toHaveBeenCalledWith([], [], 'day');
    expect(result).toEqual({ date: '2026-08-27', total: 250 });
  });

  it('getTodaySales accepts injectable now and is server-timezone independent', async () => {
    const now = new Date('2026-08-27T17:59:59.000Z');
    vi.mocked(loadSharedSalesOrders).mockResolvedValue([]);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue([]);
    vi.mocked(buildSalesTrendSeries).mockReturnValue([
      { key: '2026-08-27', date: '2026-08-27', label: 'Today', value: 50 },
    ]);

    const result = await getTodaySales({ tenantId: 'tenantA', now });

    expect(result.date).toBe('2026-08-27');
    expect(result.total).toBe(50);
  });

  it('getTodaySales returns zero when no matching series point', async () => {
    vi.setSystemTime(new Date('2026-08-26T18:00:00.000Z'));
    vi.mocked(loadSharedSalesOrders).mockResolvedValue([]);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue([]);
    vi.mocked(buildSalesTrendSeries).mockReturnValue([
      { key: '2026-08-26', date: '2026-08-26', label: 'Yesterday', value: 100 },
    ]);

    const result = await getTodaySales({ tenantId: 'tenantA' });

    expect(result).toEqual({ date: '2026-08-27', total: 0 });
  });

  it('getTodaySales does not accept or use req', async () => {
    vi.mocked(loadSharedSalesOrders).mockResolvedValue([]);
    vi.mocked(loadSharedPosTransactions).mockResolvedValue([]);
    vi.mocked(buildSalesTrendSeries).mockReturnValue([]);

    const fn = getTodaySales as (input: Record<string, unknown>) => Promise<unknown>;
    await fn({ tenantId: 'tenantA', req: { query: { tenantId: 'evil' } } });

    expect(loadSharedSalesOrders).toHaveBeenCalledWith('tenantA', 'day');
  });
});
