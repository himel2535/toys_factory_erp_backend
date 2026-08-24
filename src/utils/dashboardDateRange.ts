/**
 * Asia/Dhaka date bounds for dashboard Mongo $match filters.
 * String keys (YYYY-MM-DD) compare correctly for ISO date fields on documents.
 */

import type { ChartTrendRange } from './dashboardChartSeries.js';

const BD_TZ = 'Asia/Dhaka';
const BD_LOCALE = 'en-US';

export type DateKeyBounds = { startKey: string; endKey: string };

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

function addDays(parts: { year: number; month: number; day: number }, delta: number) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + delta, 12, 0, 0);
  return bdDateParts(new Date(utc));
}

function addMonths(parts: { year: number; month: number; day: number }, delta: number) {
  const utc = Date.UTC(parts.year, parts.month - 1 + delta, 1, 12, 0, 0);
  return bdDateParts(new Date(utc));
}

function getMondayParts(parts: { year: number; month: number; day: number }) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const d = new Date(utc);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(parts, diff);
}

/** Calendar window for a chart range — used to bound Mongo reads. */
export function chartRangeDateBounds(range: ChartTrendRange): DateKeyBounds {
  const today = bdDateParts(new Date());
  const endKey = dateKeyFromParts(today.year, today.month, today.day);

  switch (range) {
    case 'day': {
      const start = addDays(today, -6);
      return { startKey: dateKeyFromParts(start.year, start.month, start.day), endKey };
    }
    case 'week': {
      const monday = getMondayParts(today);
      const start = addDays(monday, -21);
      return { startKey: dateKeyFromParts(start.year, start.month, start.day), endKey };
    }
    case 'month':
      return { startKey: dateKeyFromParts(today.year, today.month, 1), endKey };
    case 'quarter': {
      const currentQuarter = Math.floor((today.month - 1) / 3);
      let quarter = currentQuarter - 1;
      let year = today.year;
      if (quarter < 0) {
        quarter = 3;
        year -= 1;
      }
      const startMonth = quarter * 3 + 1;
      return {
        startKey: dateKeyFromParts(year, startMonth, 1),
        endKey,
      };
    }
    case 'year': {
      const start = addMonths(today, -11);
      return { startKey: dateKeyFromParts(start.year, start.month, 1), endKey };
    }
    default:
      return { startKey: dateKeyFromParts(today.year, today.month, 1), endKey };
  }
}

/** Top-products window — rolling 12 months (same as year chart range). */
export function topProductsDateBounds(): DateKeyBounds {
  return chartRangeDateBounds('year');
}

/** $match helper for collections with date and/or issueDate string fields. */
export function tenantDateRangeMatch(
  tenantId: string,
  bounds: DateKeyBounds,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { startKey, endKey } = bounds;
  return {
    tenantId,
    ...extra,
    $or: [
      { date: { $gte: startKey, $lte: endKey } },
      { issueDate: { $gte: startKey, $lte: endKey } },
    ],
  };
}
