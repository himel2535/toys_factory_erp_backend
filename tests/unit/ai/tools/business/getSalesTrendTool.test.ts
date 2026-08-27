import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/metrics/salesMetrics.js', () => ({
  getSalesTrend: vi.fn(),
}));

import { getSalesTrend } from '../../../../../src/services/metrics/salesMetrics.js';
import type { AiExecutionContext } from '../../../../../src/ai/context/types.js';
import { executeToolCall } from '../../../../../src/ai/tools/toolExecutor.js';
import { resetToolRegistryForTests } from '../../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../../src/ai/tools/business/registerProductionTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSource = readFileSync(
  join(__dirname, '../../../../../src/ai/tools/business/getSalesTrendTool.ts'),
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

const sampleSeries = [
  { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 1200 },
];

function toolCall(args: Record<string, unknown>) {
  return {
    id: 'call_1',
    type: 'function' as const,
    function: {
      name: 'getSalesTrend',
      arguments: JSON.stringify(args),
    },
  };
}

describe('getSalesTrend production tool', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.clearAllMocks();
  });

  it('delegates to metrics with trusted tenantId and validated range', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getSalesTrend).mockResolvedValue(sampleSeries);

    const result = await executeToolCall(dashboardContext, toolCall({ range: 'week' }));

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(sampleSeries);
    expect(getSalesTrend).toHaveBeenCalledWith({ tenantId: 'tenantA', range: 'week' });
  });

  it('rejects unauthorized section access', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(inventoryContext, toolCall({ range: 'week' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
    expect(getSalesTrend).not.toHaveBeenCalled();
  });

  it('rejects tenantId supplied by the model', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ range: 'week', tenantId: 'evil' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getSalesTrend).not.toHaveBeenCalled();
  });

  it('rejects invalid range values', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ range: 'invalid' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getSalesTrend).not.toHaveBeenCalled();
  });

  it('rejects missing range', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({}));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('normalizes handler errors safely', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getSalesTrend).mockRejectedValue(new Error('secret mongo failure'));

    const result = await executeToolCall(dashboardContext, toolCall({ range: 'month' }));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
    expect(result.error?.message).not.toContain('secret');
  });

  it('does not use HTTP or Mongo in the business tool source', () => {
    expect(toolSource).not.toMatch(/\bfetch\s*\(/);
    expect(toolSource).not.toMatch(/\/api\/v1\//);
    expect(toolSource).not.toMatch(/mongoose/);
    expect(toolSource).not.toMatch(/from ['"].*models/);
  });
});
