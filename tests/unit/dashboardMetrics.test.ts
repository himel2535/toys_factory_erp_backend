import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/models/index.js', () => ({
  Invoice: { aggregate: vi.fn() },
  Lead: { aggregate: vi.fn() },
  SalesOrder: { countDocuments: vi.fn(), aggregate: vi.fn() },
  Customer: { aggregate: vi.fn() },
  RawMaterial: { aggregate: vi.fn() },
  SemiFinishedProduct: { aggregate: vi.fn() },
  FinishedGood: { aggregate: vi.fn() },
}));

vi.mock('../../src/models/extendedResources.js', () => ({
  ProductionOrder: { countDocuments: vi.fn(), aggregate: vi.fn() },
  PurchaseOrder: { aggregate: vi.fn(), countDocuments: vi.fn() },
}));

vi.mock('../../src/utils/lowStockCount.js', () => ({
  countLowStockItems: vi.fn(),
}));

import {
  Customer,
  Invoice,
  Lead,
  SalesOrder,
} from '../../src/models/index.js';
import { ProductionOrder } from '../../src/models/extendedResources.js';
import { getDashboardSummaryMetrics } from '../../src/services/metrics/dashboardMetrics.js';
import { getLowStockCount } from '../../src/services/metrics/inventoryMetrics.js';
import { countLowStockItems } from '../../src/utils/lowStockCount.js';

describe('dashboardMetrics', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getDashboardSummaryMetrics scope kpi returns expected KPI keys', async () => {
    vi.mocked(Invoice.aggregate).mockResolvedValue([{ count: 3, revenue: 1200 }]);
    vi.mocked(SalesOrder.countDocuments).mockResolvedValue(5);
    vi.mocked(Lead.aggregate).mockResolvedValue([{ count: 2, pipelineValue: 800 }]);
    vi.mocked(Customer.aggregate).mockResolvedValue([{ totalDue: 400, withDue: 1 }]);
    vi.mocked(ProductionOrder.countDocuments).mockResolvedValue(1);
    vi.mocked(ProductionOrder.aggregate).mockResolvedValue([{ qty: 10 }]);
    vi.mocked(countLowStockItems).mockResolvedValue(7);

    const { payload } = await getDashboardSummaryMetrics({ tenantId: 'tenantA', scope: 'kpi' });

    expect(payload).toEqual({
      monthRevenue: 1200,
      monthSalesCount: 3,
      pendingSales: 5,
      openLeadsCount: 2,
      openLeadsValue: 800,
      customerDue: 400,
      customerDueCount: 1,
      pendingProduction: 1,
      pendingProductionQty: 10,
      lowStock: 7,
    });
  });

  it('getDashboardSummaryMetrics uses passed tenantId in Mongo filters', async () => {
    vi.mocked(Invoice.aggregate).mockResolvedValue([]);
    vi.mocked(SalesOrder.countDocuments).mockResolvedValue(0);
    vi.mocked(Lead.aggregate).mockResolvedValue([]);
    vi.mocked(Customer.aggregate).mockResolvedValue([]);
    vi.mocked(ProductionOrder.countDocuments).mockResolvedValue(0);
    vi.mocked(ProductionOrder.aggregate).mockResolvedValue([]);
    vi.mocked(countLowStockItems).mockResolvedValue(0);

    await getDashboardSummaryMetrics({ tenantId: 'tenantZ', scope: 'kpi' });

    expect(Invoice.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({ tenantId: 'tenantZ' }),
        }),
      ]),
    );
    expect(SalesOrder.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenantZ' }),
    );
    expect(countLowStockItems).toHaveBeenCalledWith({ tenantId: 'tenantZ' }, expect.any(Object));
  });

  it('getLowStockCount wraps shared counter', async () => {
    vi.mocked(countLowStockItems).mockResolvedValue(12);

    const result = await getLowStockCount({ tenantId: 'tenantA' });

    expect(countLowStockItems).toHaveBeenCalledWith({ tenantId: 'tenantA' }, undefined);
    expect(result).toBe(12);
  });
});
