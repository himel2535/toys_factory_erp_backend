/**
 * Dashboard chart bucketing — mirrors web/lib/services/dashboard-service.ts
 * using Asia/Dhaka calendar dates (Bangladesh ERP default).
 */

import {
  addBusinessDays,
  businessDateKeyFromParts,
  formatBusinessDayLabel,
  formatBusinessMonthLabel,
  formatBusinessRangeLabel,
  formatBusinessShortDay,
  getBusinessDateParts,
  getBusinessMondayParts,
  getBusinessMonthKeyFromParts,
  lastDayOfBusinessMonth,
  parseStoredBusinessDateKey,
} from './businessDate.js';

export type ChartTrendRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ChartSeriesPoint = {
  key: string;
  date: string;
  endDate?: string;
  label: string;
  value: number;
};

type AmountRow = { dateKey: string; amount: number };

function sumBetween(rows: AmountRow[], startKey: string, endKey: string) {
  return rows
    .filter((r) => r.dateKey >= startKey && r.dateKey <= endKey)
    .reduce((s, r) => s + r.amount, 0);
}

function buildDayRange(rows: AmountRow[], today: ReturnType<typeof getBusinessDateParts>): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const parts = addBusinessDays(today, -i);
    const key = businessDateKeyFromParts(parts);
    const value = rows.filter((r) => r.dateKey === key).reduce((s, r) => s + r.amount, 0);
    result.push({ key, date: key, endDate: key, label: formatBusinessDayLabel(parts), value });
  }
  return result;
}

function buildWeekRange(rows: AmountRow[], today: ReturnType<typeof getBusinessDateParts>): ChartSeriesPoint[] {
  const thisMonday = getBusinessMondayParts(today);
  const result: ChartSeriesPoint[] = [];
  for (let i = 3; i >= 0; i -= 1) {
    const weekStart = addBusinessDays(thisMonday, -i * 7);
    const weekEnd = addBusinessDays(weekStart, 6);
    const todayKey = businessDateKeyFromParts(today);
    const endKey = businessDateKeyFromParts(weekEnd);
    const cappedEndKey = endKey > todayKey ? todayKey : endKey;
    const startKey = businessDateKeyFromParts(weekStart);
    const value = sumBetween(rows, startKey, cappedEndKey);
    const cappedParts = cappedEndKey === endKey ? weekEnd : today;
    result.push({
      key: startKey,
      date: startKey,
      endDate: cappedEndKey,
      label: formatBusinessRangeLabel(weekStart, cappedParts),
      value,
    });
  }
  return result;
}

function buildMonthRange(rows: AmountRow[], today: ReturnType<typeof getBusinessDateParts>): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let day = 1; day <= today.day; day += 1) {
    const key = businessDateKeyFromParts({ year: today.year, month: today.month, day });
    const value = rows.filter((r) => r.dateKey === key).reduce((s, r) => s + r.amount, 0);
    result.push({
      key,
      date: key,
      endDate: key,
      label: formatBusinessShortDay({ year: today.year, month: today.month, day }),
      value,
    });
  }
  return result;
}

function buildQuarterRange(rows: AmountRow[], today: ReturnType<typeof getBusinessDateParts>): ChartSeriesPoint[] {
  const currentQuarter = Math.floor((today.month - 1) / 3);
  let quarter = currentQuarter - 1;
  let year = today.year;
  if (quarter < 0) {
    quarter = 3;
    year -= 1;
  }
  const startMonth = quarter * 3 + 1;
  const result: ChartSeriesPoint[] = [];
  for (let m = 0; m < 3; m += 1) {
    const month = startMonth + m;
    const key = getBusinessMonthKeyFromParts({ year, month });
    const value = rows.filter((r) => r.dateKey.slice(0, 7) === key).reduce((s, r) => s + r.amount, 0);
    const dateKey = businessDateKeyFromParts({ year, month, day: 1 });
    const endParts = lastDayOfBusinessMonth(year, month);
    result.push({
      key,
      date: dateKey,
      endDate: businessDateKeyFromParts(endParts),
      label: formatBusinessMonthLabel(year, month),
      value,
    });
  }
  return result;
}

function buildYearRange(rows: AmountRow[], today: ReturnType<typeof getBusinessDateParts>): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const utc = Date.UTC(today.year, today.month - 1 - i, 1, 12, 0, 0);
    const parts = getBusinessDateParts(new Date(utc));
    const key = getBusinessMonthKeyFromParts(parts);
    const value = rows.filter((r) => r.dateKey.slice(0, 7) === key).reduce((s, r) => s + r.amount, 0);
    const dateKey = businessDateKeyFromParts({ year: parts.year, month: parts.month, day: 1 });
    const endParts = lastDayOfBusinessMonth(parts.year, parts.month);
    result.push({
      key,
      date: dateKey,
      endDate: businessDateKeyFromParts(endParts),
      label: formatBusinessMonthLabel(parts.year, parts.month),
      value,
    });
  }
  return result;
}

function buildChartSeries(rows: AmountRow[], range: ChartTrendRange): ChartSeriesPoint[] {
  const today = getBusinessDateParts();
  switch (range) {
    case 'day':
      return buildDayRange(rows, today);
    case 'week':
      return buildWeekRange(rows, today);
    case 'month':
      return buildMonthRange(rows, today);
    case 'quarter':
      return buildQuarterRange(rows, today);
    case 'year':
      return buildYearRange(rows, today);
    default:
      return buildMonthRange(rows, today);
  }
}

export function parseChartRange(raw: unknown): ChartTrendRange {
  const value = String(raw ?? 'month').toLowerCase();
  if (value === 'day' || value === 'week' || value === 'month' || value === 'quarter' || value === 'year') {
    return value;
  }
  return 'month';
}

function rowFromDoc(dateValue: unknown, amount: number): AmountRow | null {
  const dateKey = parseStoredBusinessDateKey(dateValue);
  if (!dateKey) return null;
  return { dateKey, amount };
}

export function buildSalesTrendSeries(
  salesOrders: Array<Record<string, unknown>>,
  posReceipts: Array<Record<string, unknown>>,
  range: ChartTrendRange,
): ChartSeriesPoint[] {
  const rows: AmountRow[] = [];
  for (const order of salesOrders) {
    const hit = rowFromDoc(order.date ?? order.createdAt, Number(order.total ?? 0));
    if (hit) rows.push(hit);
  }
  for (const receipt of posReceipts) {
    const hit = rowFromDoc(receipt.date ?? receipt.createdAt, Number(receipt.total ?? receipt.amount ?? 0));
    if (hit) rows.push(hit);
  }
  return buildChartSeries(rows, range);
}

export function buildRevenueTrendSeries(
  invoices: Array<Record<string, unknown>>,
  posReceipts: Array<Record<string, unknown>>,
  range: ChartTrendRange,
): ChartSeriesPoint[] {
  const rows: AmountRow[] = [];
  for (const inv of invoices) {
    const status = String(inv.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'canceled' || status === 'draft') continue;
    const hit = rowFromDoc(inv.issueDate ?? inv.date, Number(inv.amount ?? inv.total ?? 0));
    if (hit) rows.push(hit);
  }
  for (const receipt of posReceipts) {
    const hit = rowFromDoc(receipt.date ?? receipt.createdAt, Number(receipt.total ?? receipt.amount ?? 0));
    if (hit) rows.push(hit);
  }
  return buildChartSeries(rows, range);
}
