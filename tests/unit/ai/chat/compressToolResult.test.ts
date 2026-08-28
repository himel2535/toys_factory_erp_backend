import { describe, expect, it } from 'vitest';
import { compressToolResultForLlm } from '../../../../src/ai/chat/compressToolResult.js';
import type { ToolExecutionResult } from '../../../../src/ai/tools/types.js';

function okResult(toolName: string, data: unknown): ToolExecutionResult {
  return {
    toolCallId: 'call_1',
    toolName,
    ok: true,
    data,
    durationMs: 1,
  };
}

describe('compressToolResultForLlm', () => {
  it('passes through small getTodaySales payloads', () => {
    const result = okResult('getTodaySales', { date: '2026-08-27', sales: 100 });
    expect(compressToolResultForLlm(result)).toEqual({ date: '2026-08-27', sales: 100 });
  });

  it('compresses trend series to label/value points with totals', () => {
    const result = okResult('getSalesTrend', [
      { key: '2026-08-21', date: '2026-08-21', label: 'Aug 21', value: 800 },
      { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 1200 },
    ]);
    expect(compressToolResultForLlm(result, { range: 'week' })).toEqual({
      range: 'week',
      total: 2000,
      peak: { label: 'Aug 27', value: 1200 },
      points: [
        { label: 'Aug 21', value: 800 },
        { label: 'Aug 27', value: 1200 },
      ],
    });
  });

  it('truncates oversized payloads', () => {
    const big = { items: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}`.repeat(20) })) };
    const compressed = compressToolResultForLlm(
      okResult('getDashboardSummary', big),
      { env: { AI_MAX_TOOL_RESULT_CHARS: '200' } },
    ) as { truncated?: boolean; preview?: string };
    expect(compressed.truncated).toBe(true);
    expect(compressed.preview?.length).toBeGreaterThan(0);
  });

  it('preserves tool error payloads', () => {
    const result: ToolExecutionResult = {
      toolCallId: 'call_1',
      toolName: 'getTodaySales',
      ok: false,
      error: { code: 'TOOL_AUTH_DENIED', message: 'Access denied' },
      durationMs: 1,
    };
    expect(compressToolResultForLlm(result)).toEqual({
      error: { code: 'TOOL_AUTH_DENIED', message: 'Access denied' },
    });
  });
});
