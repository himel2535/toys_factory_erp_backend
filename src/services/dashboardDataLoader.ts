/**
 * Short-lived shared loader — dedupes Mongo reads across concurrent dashboard HTTP requests.
 * Inflight coalescing + 15s TTL per cache key prevents 40+ redundant round trips on cold load.
 */

import {
  Invoice,
  SalesOrder,
  Product,
  PosTransaction,
} from '../models/index.js';
import type { PipelineStage } from 'mongoose';
import type { ChartTrendRange } from '../utils/dashboardChartSeries.js';
import {
  chartRangeDateBounds,
  tenantDateRangeMatch,
} from '../utils/dashboardDateRange.js';

const SNAPSHOT_TTL_MS = 15_000;

type CacheEntry = { at: number; data: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidateDashboardDataLoader(tenantId?: string) {
  if (!tenantId) {
    cache.clear();
    inflight.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

async function cachedLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) {
    return hit.data as T;
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = loader()
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, pending);
  }
  return pending as Promise<T>;
}

const CANCELLED_OR_DRAFT = ['draft', 'cancelled', 'canceled', 'Draft', 'Cancelled', 'Canceled'];

export function loadSharedPosTransactions(
  tenantId: string,
  range: ChartTrendRange,
): Promise<Array<Record<string, unknown>>> {
  const key = `${tenantId}:pos:${range}`;
  const bounds = chartRangeDateBounds(range);
  return cachedLoad(key, () =>
    PosTransaction.find(tenantDateRangeMatch(tenantId, bounds))
      .select('date createdAt total amount items status')
      .lean() as Promise<Array<Record<string, unknown>>>,
  );
}

export function loadSharedSalesOrders(
  tenantId: string,
  range: ChartTrendRange,
): Promise<Array<Record<string, unknown>>> {
  const key = `${tenantId}:salesOrders:${range}`;
  const bounds = chartRangeDateBounds(range);
  return cachedLoad(key, () =>
    SalesOrder.find(tenantDateRangeMatch(tenantId, bounds))
      .select('date createdAt total items status')
      .lean() as Promise<Array<Record<string, unknown>>>,
  );
}

export function loadSharedInvoices(
  tenantId: string,
  range: ChartTrendRange,
  opts?: { revenueOnly?: boolean },
): Promise<Array<Record<string, unknown>>> {
  const mode = opts?.revenueOnly ? 'revenue' : 'all';
  const key = `${tenantId}:invoices:${range}:${mode}`;
  const bounds = chartRangeDateBounds(range);
  const extra = opts?.revenueOnly ? { status: { $nin: CANCELLED_OR_DRAFT } } : {};
  return cachedLoad(key, () =>
    Invoice.find(tenantDateRangeMatch(tenantId, bounds, extra))
      .select('date issueDate createdAt total amount status items legacyId customerId customerName due dueDate')
      .lean() as Promise<Array<Record<string, unknown>>>,
  );
}

export function loadSharedProductsCatalog(
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const key = `${tenantId}:products:catalog`;
  return cachedLoad(key, () =>
    Product.find({ tenantId }).select('sku legacyId name category imageUrl').lean() as Promise<
      Array<Record<string, unknown>>
    >,
  );
}

/** Line-level aggregates for top-products — all-time (matches dashboard widget ranking). */
export function loadTopProductLineAgg(
  tenantId: string,
  collection: 'salesorders' | 'invoices' | 'postransactions',
  limit: number,
): Promise<Array<{ sku: string; name: string; qty: number; revenue: number; imageUrl: string }>> {
  const key = `${tenantId}:topLines:all:${collection}:${limit}`;
  const match = { tenantId, status: { $nin: CANCELLED_OR_DRAFT } };

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        sku: {
          $toLower: {
            $trim: {
              input: {
                $toString: { $ifNull: ['$items.sku', { $ifNull: ['$items.productId', ''] }] },
              },
            },
          },
        },
        name: {
          $trim: {
            input: { $toString: { $ifNull: ['$items.name', { $ifNull: ['$items.description', ''] }] } },
          },
        },
        qty: { $ifNull: ['$items.qty', 0] },
        revenue: {
          $cond: [
            { $gt: [{ $ifNull: ['$items.total', 0] }, 0] },
            { $ifNull: ['$items.total', 0] },
            {
              $multiply: [
                { $ifNull: ['$items.qty', 0] },
                { $ifNull: ['$items.rate', { $ifNull: ['$items.price', 0] }] },
              ],
            },
          ],
        },
        imageUrl: { $ifNull: ['$items.imageUrl', ''] },
      },
    },
    {
      $group: {
        _id: '$sku',
        name: { $first: '$name' },
        qty: { $sum: '$qty' },
        revenue: { $sum: '$revenue' },
        imageUrl: { $first: '$imageUrl' },
      },
    },
    { $match: { _id: { $ne: '' }, $or: [{ qty: { $gt: 0 } }, { revenue: { $gt: 0 } }] } },
    { $sort: { revenue: -1, qty: -1 } },
    { $limit: limit },
  ];

  return cachedLoad(key, async () => {
    const model =
      collection === 'salesorders'
        ? SalesOrder
        : collection === 'invoices'
          ? Invoice
          : PosTransaction;
    const rows = await model.aggregate(pipeline);
    return rows.map((row: Record<string, unknown>) => ({
      sku: String(row._id ?? ''),
      name: String(row.name ?? ''),
      qty: Number(row.qty ?? 0),
      revenue: Number(row.revenue ?? 0),
      imageUrl: String(row.imageUrl ?? ''),
    }));
  });
}
