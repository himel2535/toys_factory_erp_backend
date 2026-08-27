import type { Request, Response } from 'express';
import {
  Customer,
  Invoice,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getRequestTenantId } from '../utils/tenantContext.js';
import { formatTimingLegs } from '../utils/timing.js';
import { parseChartRange } from '../utils/dashboardChartSeries.js';
import {
  loadSharedProductsCatalog,
  loadTopProductLineAgg,
} from '../services/dashboardDataLoader.js';
import {
  getDashboardSummaryMetrics,
  getRevenueTrend,
  getSalesTrend,
  type SummaryScope,
} from '../services/metrics/index.js';

function parseScope(raw: unknown): SummaryScope {
  const value = String(raw ?? 'full').toLowerCase();
  if (value === 'kpi' || value === 'extra') return value;
  return 'full';
}

/** Ranked products from SO/invoice/POS line items — all-time, Mongo $group. */
export const getDashboardTopProducts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
  const started = Date.now();
  const aggLimit = limit * 10;

  const [salesLines, invoiceLines, posLines, products] = await Promise.all([
    loadTopProductLineAgg(tenantId, 'salesorders', aggLimit),
    loadTopProductLineAgg(tenantId, 'invoices', aggLimit),
    loadTopProductLineAgg(tenantId, 'postransactions', aggLimit),
    loadSharedProductsCatalog(tenantId),
  ]);

  const catalog = new Map<string, { name: string; category: string; imageUrl: string; identity: string }>();
  const indexCatalog = (key: unknown, row: Record<string, unknown>) => {
    const normalized = String(key ?? '').trim().toLowerCase();
    if (!normalized || catalog.has(normalized)) return;
    catalog.set(normalized, {
      identity: normalized,
      name: String(row.name ?? 'Product').trim() || 'Product',
      category: String(row.category ?? '').trim() || '—',
      imageUrl: String(row.imageUrl ?? ''),
    });
  };
  for (const product of products) {
    indexCatalog(product.sku, product);
    indexCatalog(product.legacyId, product);
    indexCatalog(product.name, product);
  }

  type Acc = { name: string; category: string; sold: number; revenue: number; imageUrl: string };
  const map = new Map<string, Acc>();
  for (const line of [...salesLines, ...invoiceLines, ...posLines]) {
    const qty = Number(line.qty ?? 0);
    const revenue = Number(line.revenue ?? 0);
    if (qty <= 0 && revenue <= 0) continue;
    const skuKey = String(line.sku ?? '').trim().toLowerCase();
    const nameKey = String(line.name ?? '').trim().toLowerCase();
    const hit = catalog.get(skuKey) ?? catalog.get(nameKey);
    const identity = hit?.identity ?? (nameKey || skuKey);
    if (!identity) continue;
    const existing = map.get(identity) ?? {
      name: hit?.name ?? (String(line.name ?? '').trim() || 'Product'),
      category: hit?.category ?? '—',
      sold: 0,
      revenue: 0,
      imageUrl: hit?.imageUrl ?? String(line.imageUrl ?? ''),
    };
    existing.sold += qty;
    existing.revenue += revenue;
    if (!existing.imageUrl && line.imageUrl) existing.imageUrl = String(line.imageUrl);
    map.set(identity, existing);
  }

  const rows = Array.from(map.values())
    .filter((row) => row.sold > 0 || row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue || b.sold - a.sold)
    .slice(0, limit);

  console.log(`[timing] GET /dashboard/top-products total=${Date.now() - started}ms rows=${rows.length}`);
  sendSuccess(res, rows);
});

/** Dashboard KPI aggregates — computed in MongoDB instead of shipping full collections. */
export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const scope = parseScope(req.query.scope);
  const started = Date.now();

  const { payload, legs } = await getDashboardSummaryMetrics({ tenantId, scope });

  const totalMs = Date.now() - started;
  console.log(`[timing] GET /dashboard/summary scope=${scope} DB ${formatTimingLegs(legs)} total=${totalMs}ms`);
  sendSuccess(res, payload);
});

/** Latest invoices for dashboard widget — lightweight DTO only. */
export const getDashboardRecentInvoices = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
  const started = Date.now();

  const rows = await Invoice.find({ tenantId })
    .sort({ issueDate: -1, date: -1, createdAt: -1 })
    .limit(limit)
    .select('legacyId customerId customerName issueDate date amount total status')
    .lean();

  const missingCustomerIds = [
    ...new Set(
      rows
        .filter((row) => !String(row.customerName ?? '').trim() && row.customerId)
        .map((row) => String(row.customerId)),
    ),
  ];

  const customerNames = new Map<string, string>();
  if (missingCustomerIds.length > 0) {
    const objectIds = missingCustomerIds.filter((id) => /^[a-f0-9]{24}$/i.test(id));
    const customers = await Customer.find({
      tenantId,
      $or: [
        { legacyId: { $in: missingCustomerIds } },
        ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
      ],
    })
      .select('legacyId name company')
      .lean();

    for (const customer of customers as Array<Record<string, unknown>>) {
      const label = String(customer.company ?? customer.name ?? 'Customer').trim() || 'Customer';
      if (customer.legacyId) customerNames.set(String(customer.legacyId), label);
      if (customer._id) customerNames.set(String(customer._id), label);
    }
  }

  const payload = rows.map((row) => {
    const customerId = row.customerId ? String(row.customerId) : '';
    const resolvedName =
      String(row.customerName ?? '').trim()
      || (customerId ? customerNames.get(customerId) : undefined)
      || 'Customer';
    return {
      id: String(row.legacyId ?? row._id ?? ''),
      customerId,
      customerName: resolvedName,
      date: String(row.issueDate ?? row.date ?? '').slice(0, 10),
      amount: Number(row.amount ?? row.total ?? 0),
      status: String(row.status ?? 'pending'),
    };
  });

  console.log(`[timing] GET /dashboard/recent-invoices total=${Date.now() - started}ms rows=${payload.length}`);
  sendSuccess(res, payload);
});

/** Pre-aggregated sales trend — date-bounded Mongo reads + shared loader. */
export const getDashboardSalesTrend = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const range = parseChartRange(req.query.range);
  const started = Date.now();
  const series = await getSalesTrend({ tenantId, range });
  console.log(`[timing] GET /dashboard/sales-trend range=${range} total=${Date.now() - started}ms points=${series.length}`);
  sendSuccess(res, series);
});

/** Pre-aggregated revenue trend — date-bounded reads, status filtered in Mongo. */
export const getDashboardRevenueTrend = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const range = parseChartRange(req.query.range);
  const started = Date.now();
  const series = await getRevenueTrend({ tenantId, range });
  console.log(`[timing] GET /dashboard/revenue-trend range=${range} total=${Date.now() - started}ms points=${series.length}`);
  sendSuccess(res, series);
});
