import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/metrics/dashboardMetrics.js', () => ({
  getDashboardSummaryMetrics: vi.fn(),
}));

import { getDashboardSummaryMetrics } from '../../../../../src/services/metrics/dashboardMetrics.js';
import type { AiExecutionContext } from '../../../../../src/ai/context/types.js';
import { executeToolCall } from '../../../../../src/ai/tools/toolExecutor.js';
import { resetToolRegistryForTests } from '../../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../../src/ai/tools/business/registerProductionTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSource = readFileSync(
  join(__dirname, '../../../../../src/ai/tools/business/getDashboardSummaryTool.ts'),
  'utf8',
);

const dashboardContext: AiExecutionContext = {
  tenantId: 'tenantA',
  userId: 'user-1',
  role: 'user',
  allowedSections: ['dashboard'],
  allowedPermissions: [],
};

const inventoryContext: AiExecutionContext = {
  ...dashboardContext,
  allowedSections: ['inventory'],
};

const kpiPayload = { monthRevenue: 50000, pendingSales: 3, lowStock: 2 };

function toolCall(args: Record<string, unknown> = {}) {
  return {
    id: 'call_1',
    type: 'function' as const,
    function: {
      name: 'getDashboardSummary',
      arguments: JSON.stringify(args),
    },
  };
}

describe('getDashboardSummary production tool', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.clearAllMocks();
  });

  it('delegates to metrics with trusted tenantId and default full scope', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getDashboardSummaryMetrics).mockResolvedValue({
      payload: kpiPayload,
      legs: { monthInvoices: 5 },
    });

    const result = await executeToolCall(dashboardContext, toolCall());

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(kpiPayload);
    expect(getDashboardSummaryMetrics).toHaveBeenCalledWith({ tenantId: 'tenantA', scope: 'full' });
  });

  it('passes explicit scope to metrics', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getDashboardSummaryMetrics).mockResolvedValue({ payload: kpiPayload, legs: {} });

    await executeToolCall(dashboardContext, toolCall({ scope: 'kpi' }));

    expect(getDashboardSummaryMetrics).toHaveBeenCalledWith({ tenantId: 'tenantA', scope: 'kpi' });
  });

  it('strips internal timing legs from the tool result', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getDashboardSummaryMetrics).mockResolvedValue({
      payload: kpiPayload,
      legs: { secretTiming: 99 },
    });

    const result = await executeToolCall(dashboardContext, toolCall({ scope: 'kpi' }));

    expect(result.ok).toBe(true);
    expect(result.data).not.toHaveProperty('legs');
    expect(result.data).not.toHaveProperty('secretTiming');
  });

  it('rejects unauthorized section access', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(inventoryContext, toolCall());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
    expect(getDashboardSummaryMetrics).not.toHaveBeenCalled();
  });

  it('rejects tenantId supplied by the model', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ tenantId: 'evil' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('rejects invalid scope values', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ scope: 'all' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('normalizes handler errors safely', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getDashboardSummaryMetrics).mockRejectedValue(new Error('secret mongo'));

    const result = await executeToolCall(dashboardContext, toolCall());

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
  });

  it('does not use HTTP or Mongo in the business tool source', () => {
    expect(toolSource).not.toMatch(/\bfetch\s*\(/);
    expect(toolSource).not.toMatch(/\/api\/v1\//);
    expect(toolSource).not.toMatch(/mongoose/);
  });
});
