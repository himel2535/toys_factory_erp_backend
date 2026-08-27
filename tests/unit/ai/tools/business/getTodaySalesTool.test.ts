import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/metrics/salesMetrics.js', () => ({
  getTodaySales: vi.fn(),
}));

import { getTodaySales } from '../../../../../src/services/metrics/salesMetrics.js';
import type { AiExecutionContext } from '../../../../../src/ai/context/types.js';
import { ensureProductionToolsRegistered } from '../../../../../src/ai/tools/business/registerProductionTools.js';
import { executeToolCall } from '../../../../../src/ai/tools/toolExecutor.js';
import {
  hasTool,
  resetToolRegistryForTests,
} from '../../../../../src/ai/tools/toolRegistry.js';
import { registeredToolsToLlmDefinitions } from '../../../../../src/ai/tools/llmToolBridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolSource = readFileSync(
  join(__dirname, '../../../../../src/ai/tools/business/getTodaySalesTool.ts'),
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

const adminContext: AiExecutionContext = {
  ...dashboardContext,
  role: 'admin',
  allowedSections: [],
};

const wildcardContext: AiExecutionContext = {
  ...dashboardContext,
  allowedSections: ['*'],
};

function getTodaySalesCall() {
  return {
    id: 'call_1',
    type: 'function' as const,
    function: {
      name: 'getTodaySales',
      arguments: '{}',
    },
  };
}

describe('getTodaySales production tool', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.clearAllMocks();
  });

  it('registers the production tool lazily', () => {
    expect(hasTool('getTodaySales')).toBe(false);
    ensureProductionToolsRegistered();
    expect(hasTool('getTodaySales')).toBe(true);
  });

  it('executes successfully for an authorized dashboard user', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 1500 });

    const result = await executeToolCall(dashboardContext, getTodaySalesCall());

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ date: '2026-08-27', sales: 1500 });
  });

  it('rejects unauthorized section access', async () => {
    const result = await executeToolCall(payrollContext, getTodaySalesCall());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
    expect(getTodaySales).not.toHaveBeenCalled();
  });

  it('allows admin execution', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 900 });
    const result = await executeToolCall(adminContext, getTodaySalesCall());
    expect(result.ok).toBe(true);
  });

  it('allows wildcard section access', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 700 });
    const result = await executeToolCall(wildcardContext, getTodaySalesCall());
    expect(result.ok).toBe(true);
  });

  it('calls metrics with trusted tenantId from AiExecutionContext', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 100 });

    await executeToolCall(dashboardContext, getTodaySalesCall());

    expect(getTodaySales).toHaveBeenCalledWith({ tenantId: 'tenantA' });
    expect(getTodaySales).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'evil' }));
  });

  it('rejects tenantId supplied by the model', async () => {
    const result = await executeToolCall(dashboardContext, {
      ...getTodaySalesCall(),
      function: {
        name: 'getTodaySales',
        arguments: '{"tenantId":"evil"}',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getTodaySales).not.toHaveBeenCalled();
  });

  it('does not use HTTP in the business tool source', () => {
    expect(toolSource).not.toMatch(/\bfetch\s*\(/);
    expect(toolSource).not.toMatch(/\/api\/v1\//);
  });

  it('does not access Mongo directly in the business tool source', () => {
    expect(toolSource).not.toMatch(/mongoose/);
    expect(toolSource).not.toMatch(/from ['"].*models/);
  });

  it('propagates Asia/Dhaka business date from metrics result', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 250 });

    const result = await executeToolCall(dashboardContext, getTodaySalesCall());

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ date: '2026-08-27', sales: 250 });
  });

  it('normalizes handler errors without exposing stack traces', async () => {
    vi.mocked(getTodaySales).mockRejectedValue(new Error('secret mongo failure stack'));

    const result = await executeToolCall(dashboardContext, getTodaySalesCall());

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
    expect(result.error?.message).not.toContain('secret');
    expect(result.error?.message).not.toContain('stack');
  });

  it('rejects invalid arguments with extra properties', async () => {
    const result = await executeToolCall(dashboardContext, {
      ...getTodaySalesCall(),
      function: {
        name: 'getTodaySales',
        arguments: '{"unexpected":true}',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
    expect(getTodaySales).not.toHaveBeenCalled();
  });

  it('exposes all production tools through registered LLM definitions', () => {
    resetToolRegistryForTests();
    const defs = registeredToolsToLlmDefinitions();
    const names = defs.map((tool) => tool.function.name);
    expect(names).toContain('getTodaySales');
    expect(names).toContain('getSalesTrend');
    expect(names).toContain('getRevenueTrend');
    expect(names).toContain('getDashboardSummary');
    expect(names).toContain('getLowStockCount');
    expect(names).toHaveLength(5);
  });
});
