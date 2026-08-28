import { describe, expect, it } from 'vitest';
import {
  buildAiRequestMetrics,
  createEmptyUsage,
  mergeUsage,
} from '../../../../src/ai/chat/aiRequestMetrics.js';

describe('aiRequestMetrics', () => {
  it('merges provider usage totals across rounds', () => {
    let usage = createEmptyUsage();
    usage = mergeUsage(usage, { promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    usage = mergeUsage(usage, { promptTokens: 50, completionTokens: 10, totalTokens: 60 });
    expect(usage).toEqual({ promptTokens: 150, completionTokens: 30, totalTokens: 180 });
  });

  it('builds structured metrics without sensitive fields', () => {
    const metrics = buildAiRequestMetrics({
      totalMs: 900,
      providerMs: 700,
      toolMs: 150,
      toolCallCount: 1,
      toolRounds: 1,
      promptTokens: 200,
      completionTokens: 40,
      totalTokens: 240,
      promptGuardBlocked: false,
    });
    expect(metrics).toEqual({
      totalMs: 900,
      providerMs: 700,
      toolMs: 150,
      toolCallCount: 1,
      toolRounds: 1,
      promptTokens: 200,
      completionTokens: 40,
      totalTokens: 240,
      promptGuardBlocked: false,
    });
    expect(JSON.stringify(metrics)).not.toContain('apiKey');
    expect(JSON.stringify(metrics)).not.toContain('message');
    expect(JSON.stringify(metrics)).not.toContain('cookie');
  });
});
