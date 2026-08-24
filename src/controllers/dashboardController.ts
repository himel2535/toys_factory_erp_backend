import type { Request, Response } from 'express';
import {
  Customer,
  Invoice,
  Lead,
  SalesOrder,
  RawMaterial,
  SemiFinishedProduct,
  FinishedGood,
} from '../models/index.js';
import { PurchaseOrder, ProductionOrder } from '../models/extendedResources.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { countLowStockItems } from '../utils/lowStockCount.js';
import { currentMonthPrefix, invoiceMonthMatch } from '../utils/monthPrefix.js';
import { formatTimingLegs, timeNamed } from '../utils/timing.js';
import {
  buildRevenueTrendSeries,
  buildSalesTrendSeries,
  parseChartRange,
} from '../utils/dashboardChartSeries.js';
import {
  loadSharedInvoices,
  loadSharedPosTransactions,
  loadSharedProductsCatalog,
  loadSharedSalesOrders,
  loadTopProductLineAgg,
} from '../services/dashboardDataLoader.js';

type Filter = { tenantId: string };
type Legs = Record<string, number>;
type SummaryScope = 'kpi' | 'extra' | 'full';

function tenantFilter(tenantId: string): Filter {
  return { tenantId };
}

function parseScope(raw: unknown): SummaryScope {
  const value = String(raw ?? 'full').toLowerCase();
  if (value === 'kpi' || value === 'extra') return value;
  return 'full';
}

function inventoryValuePipeline(filter: Record<string, unknown>, qtyField: string, valueFields: string[]) {
  const unitValue = valueFields.reduceRight<unknown>((acc, field) => ({ $ifNull: [`$${field}`, acc] }), 0);
  return [
    { $match: filter },
    {
      $group: {
        _id: null,
        v: { $sum: { $multiply: [{ $ifNull: [`$${qtyField}`, 0] }, unitValue] } },
      },
    },
  ];
}

async function loadKpiSummary(tenantId: string, filter: Filter, monthPrefix: string, legs: Legs) {
  const [
    monthSales,
    pendingSales,
    openLeads,
    customerDue,
    productionPending,
    productionPendingQty,
    lowStock,
  ] = await Promise.all([
    timeNamed('monthInvoices', () => Invoice.aggregate([
      { $match: invoiceMonthMatch(tenantId, monthPrefix) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$amount', { $ifNull: ['$total', 0] }] } },
        },
      },
    ]), legs),
    timeNamed('pendingSales', () => SalesOrder.countDocuments({
      ...filter,
      status: { $in: ['confirmed', 'processing', 'draft', 'Confirmed', 'Processing', 'Draft'] },
    }), legs),
    timeNamed('openLeads', () => Lead.aggregate([
      { $match: { ...filter, status: { $nin: ['won', 'lost', 'closed', 'Won', 'Lost', 'Closed'] } } },
      { $group: { _id: null, count: { $sum: 1 }, pipelineValue: { $sum: { $ifNull: ['$expectedValue', 0] } } } },
    ]), legs),
    timeNamed('customerDue', () => Customer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDue: {
            $sum: { $ifNull: ['$totalDue', { $ifNull: ['$due', 0] }] },
          },
          withDue: {
            $sum: {
              $cond: [{ $gt: [{ $ifNull: ['$totalDue', { $ifNull: ['$due', 0] }] }, 0] }, 1, 0],
            },
          },
        },
      },
    ]), legs),
    timeNamed('productionPending', () => ProductionOrder.countDocuments({
      ...filter,
      status: { $in: ['Planned', 'In Progress'] },
    }), legs),
    timeNamed('productionPendingQty', () => ProductionOrder.aggregate([
      { $match: { ...filter, status: { $in: ['Planned', 'In Progress'] } } },
      { $group: { _id: null, qty: { $sum: { $ifNull: ['$plannedQuantity', 0] } } } },
    ]), legs),
    timeNamed('lowStock', () => countLowStockItems(filter, legs), legs),
  ]);

  return {
    monthRevenue: monthSales[0]?.revenue ?? 0,
    monthSalesCount: monthSales[0]?.count ?? 0,
    pendingSales,
    openLeadsCount: openLeads[0]?.count ?? 0,
    openLeadsValue: openLeads[0]?.pipelineValue ?? 0,
    customerDue: customerDue[0]?.totalDue ?? 0,
    customerDueCount: customerDue[0]?.withDue ?? 0,
    pendingProduction: productionPending,
    pendingProductionQty: productionPendingQty[0]?.qty ?? 0,
    lowStock,
  };
}

async function loadExtraSummary(filter: Filter, legs: Legs) {
  const [
    salesSummary,
    supplierDue,
    productionCompleted,
    purchaseSummary,
    purchasePending,
    inventoryValue,
  ] = await Promise.all([
    timeNamed('salesAgg', () => SalesOrder.aggregate([
      { $match: filter },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]), legs),
    timeNamed('supplierDue', () => PurchaseOrder.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDue: { $sum: { $ifNull: ['$due', { $ifNull: ['$balance', 0] }] } },
          withDue: {
            $sum: {
              $cond: [{ $gt: [{ $ifNull: ['$due', { $ifNull: ['$balance', 0] }] }, 0] }, 1, 0],
            },
          },
        },
      },
    ]), legs),
    timeNamed('productionCompleted', () => ProductionOrder.aggregate([
      { $match: { ...filter, status: 'Completed' } },
      { $group: { _id: null, count: { $sum: 1 }, qty: { $sum: { $ifNull: ['$actualQuantity', { $ifNull: ['$plannedQuantity', 0] }] } } } },
    ]), legs),
    timeNamed('purchaseSummary', () => PurchaseOrder.aggregate([
      { $match: filter },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]), legs),
    timeNamed('pendingPurchase', () => PurchaseOrder.countDocuments({
      ...filter,
      status: { $in: ['Draft', 'Sent'] },
    }), legs),
    timeNamed('inventoryValue', () => Promise.all([
      RawMaterial.aggregate(inventoryValuePipeline(filter, 'quantity', ['cost', 'price', 'supplierPrice'])),
      SemiFinishedProduct.aggregate(inventoryValuePipeline(filter, 'quantity', ['avgCost', 'cost'])),
      FinishedGood.aggregate(inventoryValuePipeline(filter, 'quantity', ['avgCost', 'price', 'cost'])),
    ]), legs),
  ]);

  const rmVal = inventoryValue[0]?.[0]?.v ?? 0;
  const sfVal = inventoryValue[1]?.[0]?.v ?? 0;
  const fgVal = inventoryValue[2]?.[0]?.v ?? 0;

  return {
    salesSummary: {
      count: salesSummary[0]?.count ?? 0,
      total: salesSummary[0]?.total ?? 0,
    },
    purchaseSummary: {
      count: purchaseSummary[0]?.count ?? 0,
      total: purchaseSummary[0]?.total ?? 0,
    },
    supplierDue: supplierDue[0]?.totalDue ?? 0,
    supplierDueCount: supplierDue[0]?.withDue ?? 0,
    productionCompleted: productionCompleted[0]?.count ?? 0,
    productionQty: productionCompleted[0]?.qty ?? 0,
    pendingPurchase: purchasePending,
    rmStockValue: rmVal,
    sfStockValue: sfVal,
    fgStockValue: fgVal,
    totalInventoryValue: rmVal + sfVal + fgVal,
  };
}


/** Ranked products from SO/invoice/POS line items — all-time, Mongo $group. */
export const getDashboardTopProducts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId ?? 'default');
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
  const tenantId = String(req.query.tenantId ?? 'default');
  const scope = parseScope(req.query.scope);
  const filter = tenantFilter(tenantId);
  const monthPrefix = currentMonthPrefix();
  const started = Date.now();
  const legs: Legs = {};

  let payload: Record<string, unknown>;
  if (scope === 'kpi') {
    payload = await loadKpiSummary(tenantId, filter, monthPrefix, legs);
  } else if (scope === 'extra') {
    payload = await loadExtraSummary(filter, legs);
  } else {
    const kpiLegs: Legs = {};
    const extraLegs: Legs = {};
    const [kpi, extra] = await Promise.all([
      loadKpiSummary(tenantId, filter, monthPrefix, kpiLegs),
      loadExtraSummary(filter, extraLegs),
    ]);
    Object.assign(legs, kpiLegs, extraLegs);
    payload = { ...kpi, ...extra };
  }

  const totalMs = Date.now() - started;
  console.log(`[timing] GET /dashboard/summary scope=${scope} DB ${formatTimingLegs(legs)} total=${totalMs}ms`);
  sendSuccess(res, payload);
});

/** Latest invoices for dashboard widget — lightweight DTO only. */
export const getDashboardRecentInvoices = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId ?? 'default');
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
  const tenantId = String(req.query.tenantId ?? 'default');
  const range = parseChartRange(req.query.range);
  const started = Date.now();
  const [salesOrders, posReceipts] = await Promise.all([
    loadSharedSalesOrders(tenantId, range),
    loadSharedPosTransactions(tenantId, range),
  ]);
  const series = buildSalesTrendSeries(salesOrders, posReceipts, range);
  console.log(`[timing] GET /dashboard/sales-trend range=${range} total=${Date.now() - started}ms points=${series.length}`);
  sendSuccess(res, series);
});

/** Pre-aggregated revenue trend — date-bounded reads, status filtered in Mongo. */
export const getDashboardRevenueTrend = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId ?? 'default');
  const range = parseChartRange(req.query.range);
  const started = Date.now();
  const [invoices, posReceipts] = await Promise.all([
    loadSharedInvoices(tenantId, range, { revenueOnly: true }),
    loadSharedPosTransactions(tenantId, range),
  ]);
  const series = buildRevenueTrendSeries(invoices, posReceipts, range);
  console.log(`[timing] GET /dashboard/revenue-trend range=${range} total=${Date.now() - started}ms points=${series.length}`);
  sendSuccess(res, series);
});
