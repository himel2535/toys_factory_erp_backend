import { afterEach, describe, expect, it } from 'vitest';
import {
  getAiMetricsSnapshot,
  recordAiRequestMetrics,
  resetAiMetricsAggregatorForTests,
} from '../../../../src/ai/chat/aiMetricsAggregator.js';
import type { AiRequestMetrics } from '../../../../src/ai/chat/aiRequestMetrics.js';

function sampleMetrics(overrides: Partial<AiRequestMetrics> = {}): AiRequestMetrics {
  return {
    requestId: 'req-1',
    timestamp: new Date().toISOString(),
    provider: 'openai_compatible',
    model: 'openai/gpt-oss-20b',
    status: 'success',
    totalMs: 1000,
    providerMs: 600,
    toolMs: 300,
    overheadMs: 100,
    providerCallCount: 1,
    toolCallCount: 1,
    toolRounds: 1,
    toolTotalMs: 300,
    tools: [{
      toolName: 'getTodaySales',
      callCount: 1,
      totalMs: 300,
      failureCount: 0,
      averageMs: 300,
    }],
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    promptGuardBlocked: false,
    toolValidationFailures: 0,
    ...overrides,
  };
}

describe('aiMetricsAggregator', () => {
  afterEach(() => {
    resetAiMetricsAggregatorForTests();
  });

  it('increments success and latency counters', () => {
    recordAiRequestMetrics(sampleMetrics());
    const snapshot = getAiMetricsSnapshot();

    expect(snapshot.totalRequests).toBe(1);
    expect(snapshot.successfulRequests).toBe(1);
    expect(snapshot.failedRequests).toBe(0);
    expect(snapshot.averageLatencyMs).toBe(1000);
    expect(snapshot.averageProviderLatencyMs).toBe(600);
    expect(snapshot.averageToolLatencyMs).toBe(300);
    expect(snapshot.averageTokens).toBe(150);
    expect(snapshot.totalToolCalls).toBe(1);
    expect(snapshot.successRate).toBe(1);
  });

  it('tracks failure, timeout, rate limit, and blocked counters', () => {
    recordAiRequestMetrics(sampleMetrics({ status: 'error', totalMs: 500 }));
    recordAiRequestMetrics(sampleMetrics({ status: 'timeout', totalMs: 400 }));
    recordAiRequestMetrics(sampleMetrics({ status: 'rate_limited', totalMs: 300 }));
    recordAiRequestMetrics(sampleMetrics({
      status: 'blocked',
      promptGuardBlocked: true,
      totalMs: 200,
      providerMs: 0,
      toolMs: 0,
    }));

    const snapshot = getAiMetricsSnapshot();
    expect(snapshot.totalRequests).toBe(4);
    expect(snapshot.successfulRequests).toBe(0);
    expect(snapshot.failedRequests).toBe(4);
    expect(snapshot.timeouts).toBe(1);
    expect(snapshot.rateLimitedRequests).toBe(1);
    expect(snapshot.blockedRequests).toBe(1);
    expect(snapshot.promptGuardBlocks).toBe(1);
  });

  it('aggregates per-provider and per-tool stats with bounded keys', () => {
    recordAiRequestMetrics(sampleMetrics());
    recordAiRequestMetrics(sampleMetrics({
      provider: 'llama_cpp',
      model: 'Qwen/Qwen3-1.7B-GGUF',
      tools: [{
        toolName: 'getSalesTrend',
        callCount: 2,
        totalMs: 400,
        failureCount: 1,
        averageMs: 200,
      }],
      toolValidationFailures: 1,
    }));

    const snapshot = getAiMetricsSnapshot();
    expect(snapshot.providers).toHaveLength(2);
    expect(snapshot.tools).toHaveLength(2);
    expect(snapshot.toolValidationFailures).toBe(1);
  });

  it('ignores token averages when usage is unavailable', () => {
    recordAiRequestMetrics(sampleMetrics({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    }));

    expect(getAiMetricsSnapshot().averageTokens).toBeNull();
  });

  it('resets counters for tests', () => {
    recordAiRequestMetrics(sampleMetrics());
    resetAiMetricsAggregatorForTests();
    expect(getAiMetricsSnapshot().totalRequests).toBe(0);
  });
});
