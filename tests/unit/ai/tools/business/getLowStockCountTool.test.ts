import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/metrics/inventoryMetrics.js', () => ({
  getLowStockCount: vi.fn(),
}));

import { getLowStockCount } from '../../../../../src/services/metrics/inventoryMetrics.js';
import type { AiExecutionContext } from '../../../../../src/ai/context/types.js';
import { executeToolCall } from '../../../../../src/ai/tools/toolExecutor.js';
import { resetToolRegistryForTests } from '../../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../../src/ai/tools/business/registerProductionTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSource = readFileSync(
  join(__dirname, '../../../../../src/ai/tools/business/getLowStockCountTool.ts'),
  'utf8',
);

const inventoryContext: AiExecutionContext = {
  tenantId: 'tenantA',
  userId: 'user-1',
  role: 'user',
  allowedSections: ['inventory'],
  allowedPermissions: [],
};

const dashboardContext: AiExecutionContext = {
  ...inventoryContext,
  allowedSections: ['dashboard'],
};

function toolCall(args: Record<string, unknown> = {}) {
  return {
    id: 'call_1',
    type: 'function' as const,
    function: {
      name: 'getLowStockCount',
      arguments: JSON.stringify(args),
    },
  };
}

describe('getLowStockCount production tool', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.clearAllMocks();
  });

  it('delegates to metrics with trusted tenantId', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getLowStockCount).mockResolvedValue(7);

    const result = await executeToolCall(inventoryContext, toolCall());

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ count: 7 });
    expect(getLowStockCount).toHaveBeenCalledWith({ tenantId: 'tenantA' });
  });

  it('rejects unauthorized section access', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
    expect(getLowStockCount).not.toHaveBeenCalled();
  });

  it('rejects tenantId supplied by the model', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(inventoryContext, toolCall({ tenantId: 'evil' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getLowStockCount).not.toHaveBeenCalled();
  });

  it('rejects unexpected arguments', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(inventoryContext, toolCall({ filter: 'all' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('normalizes handler errors safely', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getLowStockCount).mockRejectedValue(new Error('secret failure'));

    const result = await executeToolCall(inventoryContext, toolCall());

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
  });

  it('does not use HTTP or Mongo in the business tool source', () => {
    expect(toolSource).not.toMatch(/\bfetch\s*\(/);
    expect(toolSource).not.toMatch(/\/api\/v1\//);
    expect(toolSource).not.toMatch(/mongoose/);
  });
});
