/**
 * Dashboard chart bucketing — mirrors web/lib/services/dashboard-service.ts
 * using Asia/Dhaka calendar dates (Bangladesh ERP default).
 */

export type ChartTrendRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ChartSeriesPoint = {
  key: string;
  date: string;
  endDate?: string;
  label: string;
  value: number;
};

type AmountRow = { dateKey: string; amount: number };

const BD_TZ = 'Asia/Dhaka';
const BD_LOCALE = 'en-US';

function bdDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat(BD_LOCALE, {
    timeZone: BD_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function bdTodayParts(): { year: number; month: number; day: number } {
  return bdDateParts(new Date());
}

function parseStoredDateKey(value: unknown): string | null {
  if (!value) return null;
  const slice = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function addDays(parts: { year: number; month: number; day: number }, delta: number) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + delta, 12, 0, 0);
  return bdDateParts(new Date(utc));
}

function getMondayParts(parts: { year: number; month: number; day: number }) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const d = new Date(utc);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(parts, diff);
}

function formatDayLabel(parts: { year: number; month: number; day: number }) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  return new Date(utc).toLocaleDateString(BD_LOCALE, {
    timeZone: BD_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatShortDay(parts: { year: number; month: number; day: number }) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  return new Date(utc).toLocaleDateString(BD_LOCALE, {
    timeZone: BD_TZ,
    day: 'numeric',
    month: 'short',
  });
}

function formatRangeLabel(
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
) {
  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return formatShortDay(start);
  }
  if (start.year === end.year && start.month === end.month) {
    const utc = Date.UTC(start.year, start.month - 1, 1, 12, 0, 0);
    const month = new Date(utc).toLocaleDateString(BD_LOCALE, { timeZone: BD_TZ, month: 'short' });
    return `${start.day}–${end.day} ${month}`;
  }
  return `${formatShortDay(start)}–${formatShortDay(end)}`;
}

function formatMonthLabel(year: number, month: number) {
  const utc = Date.UTC(year, month - 1, 1, 12, 0, 0);
  return new Date(utc).toLocaleDateString(BD_LOCALE, {
    timeZone: BD_TZ,
    month: 'short',
    year: '2-digit',
  });
}

function sumBetween(rows: AmountRow[], startKey: string, endKey: string) {
  return rows
    .filter((r) => r.dateKey >= startKey && r.dateKey <= endKey)
    .reduce((s, r) => s + r.amount, 0);
}

function buildDayRange(rows: AmountRow[], today: { year: number; month: number; day: number }): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const parts = addDays(today, -i);
    const key = dateKeyFromParts(parts.year, parts.month, parts.day);
    const value = rows.filter((r) => r.dateKey === key).reduce((s, r) => s + r.amount, 0);
    result.push({ key, date: key, endDate: key, label: formatDayLabel(parts), value });
  }
  return result;
}

function buildWeekRange(rows: AmountRow[], today: { year: number; month: number; day: number }): ChartSeriesPoint[] {
  const thisMonday = getMondayParts(today);
  const result: ChartSeriesPoint[] = [];
  for (let i = 3; i >= 0; i -= 1) {
    const weekStart = addDays(thisMonday, -i * 7);
    const weekEnd = addDays(weekStart, 6);
    const todayKey = dateKeyFromParts(today.year, today.month, today.day);
    const endKey = dateKeyFromParts(weekEnd.year, weekEnd.month, weekEnd.day);
    const cappedEndKey = endKey > todayKey ? todayKey : endKey;
    const startKey = dateKeyFromParts(weekStart.year, weekStart.month, weekStart.day);
    const value = sumBetween(rows, startKey, cappedEndKey);
    const cappedParts = cappedEndKey === endKey ? weekEnd : today;
    result.push({
      key: startKey,
      date: startKey,
      endDate: cappedEndKey,
      label: formatRangeLabel(weekStart, cappedParts),
      value,
    });
  }
  return result;
}

function buildMonthRange(rows: AmountRow[], today: { year: number; month: number; day: number }): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let day = 1; day <= today.day; day += 1) {
    const key = dateKeyFromParts(today.year, today.month, day);
    const value = rows.filter((r) => r.dateKey === key).reduce((s, r) => s + r.amount, 0);
    result.push({
      key,
      date: key,
      endDate: key,
      label: formatShortDay({ year: today.year, month: today.month, day }),
      value,
    });
  }
  return result;
}

function buildQuarterRange(rows: AmountRow[], today: { year: number; month: number; day: number }): ChartSeriesPoint[] {
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
    const key = monthKeyFromParts(year, month);
    const value = rows.filter((r) => r.dateKey.slice(0, 7) === key).reduce((s, r) => s + r.amount, 0);
    const dateKey = dateKeyFromParts(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    const endParts = bdDateParts(lastDay);
    result.push({
      key,
      date: dateKey,
      endDate: dateKeyFromParts(endParts.year, endParts.month, endParts.day),
      label: formatMonthLabel(year, month),
      value,
    });
  }
  return result;
}

function buildYearRange(rows: AmountRow[], today: { year: number; month: number; day: number }): ChartSeriesPoint[] {
  const result: ChartSeriesPoint[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const utc = Date.UTC(today.year, today.month - 1 - i, 1, 12, 0, 0);
    const parts = bdDateParts(new Date(utc));
    const key = monthKeyFromParts(parts.year, parts.month);
    const value = rows.filter((r) => r.dateKey.slice(0, 7) === key).reduce((s, r) => s + r.amount, 0);
    const dateKey = dateKeyFromParts(parts.year, parts.month, 1);
    const lastDay = new Date(Date.UTC(parts.year, parts.month, 0, 12, 0, 0));
    const endParts = bdDateParts(lastDay);
    result.push({
      key,
      date: dateKey,
      endDate: dateKeyFromParts(endParts.year, endParts.month, endParts.day),
      label: formatMonthLabel(parts.year, parts.month),
      value,
    });
  }
  return result;
}

function buildChartSeries(rows: AmountRow[], range: ChartTrendRange): ChartSeriesPoint[] {
  const today = bdTodayParts();
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
  const dateKey = parseStoredDateKey(dateValue);
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
