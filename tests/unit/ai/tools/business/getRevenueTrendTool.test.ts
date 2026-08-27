import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/metrics/salesMetrics.js', () => ({
  getRevenueTrend: vi.fn(),
}));

import { getRevenueTrend } from '../../../../../src/services/metrics/salesMetrics.js';
import type { AiExecutionContext } from '../../../../../src/ai/context/types.js';
import { executeToolCall } from '../../../../../src/ai/tools/toolExecutor.js';
import { resetToolRegistryForTests } from '../../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../../src/ai/tools/business/registerProductionTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSource = readFileSync(
  join(__dirname, '../../../../../src/ai/tools/business/getRevenueTrendTool.ts'),
  'utf8',
);

const dashboardContext: AiExecutionContext = {
  tenantId: 'tenantA',
  userId: 'user-1',
  role: 'user',
  allowedSections: ['dashboard'],
  allowedPermissions: [],
};

const payrollContext: AiExecutionContext = {
  ...dashboardContext,
  allowedSections: ['payroll'],
};

const sampleSeries = [
  { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 900 },
];

function toolCall(args: Record<string, unknown>) {
  return {
    id: 'call_1',
    type: 'function' as const,
    function: {
      name: 'getRevenueTrend',
      arguments: JSON.stringify(args),
    },
  };
}

describe('getRevenueTrend production tool', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.clearAllMocks();
  });

  it('delegates to metrics with trusted tenantId and validated range', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getRevenueTrend).mockResolvedValue(sampleSeries);

    const result = await executeToolCall(dashboardContext, toolCall({ range: 'day' }));

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(sampleSeries);
    expect(getRevenueTrend).toHaveBeenCalledWith({ tenantId: 'tenantA', range: 'day' });
  });

  it('rejects unauthorized section access', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(payrollContext, toolCall({ range: 'day' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
    expect(getRevenueTrend).not.toHaveBeenCalled();
  });

  it('rejects tenantId supplied by the model', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ range: 'day', tenantId: 'evil' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getRevenueTrend).not.toHaveBeenCalled();
  });

  it('rejects invalid range values', async () => {
    ensureProductionToolsRegistered();
    const result = await executeToolCall(dashboardContext, toolCall({ range: 'daily' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('normalizes handler errors safely', async () => {
    ensureProductionToolsRegistered();
    vi.mocked(getRevenueTrend).mockRejectedValue(new Error('secret failure'));

    const result = await executeToolCall(dashboardContext, toolCall({ range: 'year' }));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
  });

  it('does not use HTTP or Mongo in the business tool source', () => {
    expect(toolSource).not.toMatch(/\bfetch\s*\(/);
    expect(toolSource).not.toMatch(/\/api\/v1\//);
    expect(toolSource).not.toMatch(/mongoose/);
  });
});
