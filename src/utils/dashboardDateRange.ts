/**
 * Asia/Dhaka date bounds for dashboard Mongo $match filters.
 * String keys (YYYY-MM-DD) compare correctly for ISO date fields on documents.
 */

import type { ChartTrendRange } from './dashboardChartSeries.js';
import {
  addBusinessDays,
  addBusinessMonths,
  businessDateKeyFromParts,
  getBusinessDateParts,
  getBusinessMondayParts,
} from './businessDate.js';

export type DateKeyBounds = { startKey: string; endKey: string };

/** Calendar window for a chart range — used to bound Mongo reads. */
export function chartRangeDateBounds(range: ChartTrendRange): DateKeyBounds {
  const today = getBusinessDateParts();
  const endKey = businessDateKeyFromParts(today);

  switch (range) {
    case 'day': {
      const start = addBusinessDays(today, -6);
      return { startKey: businessDateKeyFromParts(start), endKey };
    }
    case 'week': {
      const monday = getBusinessMondayParts(today);
      const start = addBusinessDays(monday, -21);
      return { startKey: businessDateKeyFromParts(start), endKey };
    }
    case 'month':
      return { startKey: businessDateKeyFromParts({ ...today, day: 1 }), endKey };
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
        startKey: businessDateKeyFromParts({ year, month: startMonth, day: 1 }),
        endKey,
      };
    }
    case 'year': {
      const start = addBusinessMonths(today, -11);
      return { startKey: businessDateKeyFromParts({ ...start, day: 1 }), endKey };
    }
    default:
      return { startKey: businessDateKeyFromParts({ ...today, day: 1 }), endKey };
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
