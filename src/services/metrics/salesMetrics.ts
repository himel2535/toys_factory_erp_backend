import {
  buildRevenueTrendSeries,
  buildSalesTrendSeries,
  type ChartSeriesPoint,
  type ChartTrendRange,
} from '../../utils/dashboardChartSeries.js';
import { getBusinessTodayIso } from '../../utils/businessDate.js';
import {
  loadSharedInvoices,
  loadSharedPosTransactions,
  loadSharedSalesOrders,
} from '../dashboardDataLoader.js';
import type { MetricsContext, TodaySalesResult } from './types.js';

export type SalesTrendInput = MetricsContext & {
  range: ChartTrendRange;
};

export async function getSalesTrend({ tenantId, range }: SalesTrendInput): Promise<ChartSeriesPoint[]> {
  const [salesOrders, posReceipts] = await Promise.all([
    loadSharedSalesOrders(tenantId, range),
    loadSharedPosTransactions(tenantId, range),
  ]);
  return buildSalesTrendSeries(salesOrders, posReceipts, range);
}

export async function getRevenueTrend({ tenantId, range }: SalesTrendInput): Promise<ChartSeriesPoint[]> {
  const [invoices, posReceipts] = await Promise.all([
    loadSharedInvoices(tenantId, range, { revenueOnly: true }),
    loadSharedPosTransactions(tenantId, range),
  ]);
  return buildRevenueTrendSeries(invoices, posReceipts, range);
}

/** Authoritative today sales — same path as GET /dashboard/sales-trend?range=day. */
export async function getTodaySales({ tenantId, now }: MetricsContext): Promise<TodaySalesResult> {
  const date = getBusinessTodayIso(now);
  const series = await getSalesTrend({ tenantId, range: 'day' });
  const todayPoint = series.find((point) => point.key === date || point.date === date);
  return {
    date,
    total: todayPoint?.value ?? 0,
  };
}
