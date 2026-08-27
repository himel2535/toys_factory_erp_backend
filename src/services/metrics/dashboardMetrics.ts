import {
  Customer,
  Invoice,
  Lead,
  SalesOrder,
  RawMaterial,
  SemiFinishedProduct,
  FinishedGood,
} from '../../models/index.js';
import { PurchaseOrder, ProductionOrder } from '../../models/extendedResources.js';
import { currentMonthPrefix, invoiceMonthMatch } from '../../utils/monthPrefix.js';
import { timeNamed } from '../../utils/timing.js';
import { getLowStockCount } from './inventoryMetrics.js';
import type { SummaryScope, TimingLegs } from './types.js';

type TenantFilter = { tenantId: string };

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

export async function loadKpiSummary(
  tenantId: string,
  filter: TenantFilter,
  monthPrefix: string,
  legs: TimingLegs,
) {
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
    timeNamed('lowStock', () => getLowStockCount({ tenantId }, legs), legs),
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

export async function loadExtraSummary(filter: TenantFilter, legs: TimingLegs) {
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

export type DashboardSummaryInput = {
  tenantId: string;
  scope: SummaryScope;
  now?: Date;
};

export type DashboardSummaryResult = {
  payload: Record<string, unknown>;
  legs: TimingLegs;
};

export async function getDashboardSummaryMetrics({
  tenantId,
  scope,
  now,
}: DashboardSummaryInput): Promise<DashboardSummaryResult> {
  const filter: TenantFilter = { tenantId };
  const monthPrefix = currentMonthPrefix(now);
  const legs: TimingLegs = {};

  if (scope === 'kpi') {
    return {
      payload: await loadKpiSummary(tenantId, filter, monthPrefix, legs),
      legs,
    };
  }

  if (scope === 'extra') {
    return {
      payload: await loadExtraSummary(filter, legs),
      legs,
    };
  }

  const kpiLegs: TimingLegs = {};
  const extraLegs: TimingLegs = {};
  const [kpi, extra] = await Promise.all([
    loadKpiSummary(tenantId, filter, monthPrefix, kpiLegs),
    loadExtraSummary(filter, extraLegs),
  ]);
  Object.assign(legs, kpiLegs, extraLegs);
  return {
    payload: { ...kpi, ...extra },
    legs,
  };
}
