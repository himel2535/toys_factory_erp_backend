import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../src/utils/ApiError.js';
import {
  LlmConfigError,
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from '../../../../src/ai/errors.js';
import {
  classifyAiChatError,
  createAiRequestMetricsTracker,
  createEmptyUsage,
  finalizeAiRequestMetrics,
  logAiRequestMetrics,
  mergeUsage,
  resolveAiRequestStatus,
  usageHasValues,
} from '../../../../src/ai/chat/aiRequestMetrics.js';

describe('aiRequestMetrics', () => {
  it('merges provider usage totals across rounds', () => {
    let usage = createEmptyUsage();
    usage = mergeUsage(usage, { promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    usage = mergeUsage(usage, { promptTokens: 50, completionTokens: 10, totalTokens: 60 });
    expect(usage).toEqual({ promptTokens: 150, completionTokens: 30, totalTokens: 180 });
    expect(usageHasValues(usage)).toBe(true);
  });

  it('finalizes success metrics with overhead and per-tool aggregates', () => {
    const tracker = createAiRequestMetricsTracker({ requestId: 'req-1' });
    tracker.recordProviderCall(700, { promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    tracker.recordToolRound();
    tracker.recordToolExecution({
      toolName: 'getTodaySales',
      durationMs: 150,
      ok: true,
    });

    const metrics = finalizeAiRequestMetrics({
      tracker,
      startedAt: Date.now() - 900,
      config: { provider: 'openai_compatible', model: 'openai/gpt-oss-20b' },
      status: 'success',
    });

    expect(metrics.requestId).toBe('req-1');
    expect(metrics.status).toBe('success');
    expect(metrics.providerMs).toBe(700);
    expect(metrics.toolMs).toBe(150);
    expect(metrics.overheadMs).toBeGreaterThanOrEqual(0);
    expect(metrics.providerCallCount).toBe(1);
    expect(metrics.promptTokens).toBe(100);
    expect(metrics.tools).toEqual([{
      toolName: 'getTodaySales',
      callCount: 1,
      totalMs: 150,
      failureCount: 0,
      averageMs: 150,
    }]);
  });

  it('uses null tokens when provider never returned usage', () => {
    const tracker = createAiRequestMetricsTracker({ requestId: 'req-2' });
    tracker.recordProviderCall(500);

    const metrics = finalizeAiRequestMetrics({
      tracker,
      startedAt: Date.now() - 600,
      config: { provider: 'openai_compatible', model: 'openai/gpt-oss-20b' },
      status: 'success',
    });

    expect(metrics.promptTokens).toBeNull();
    expect(metrics.completionTokens).toBeNull();
    expect(metrics.totalTokens).toBeNull();
  });

  it('never allows negative overhead', () => {
    const tracker = createAiRequestMetricsTracker({ requestId: 'req-3' });
    tracker.recordProviderCall(900);
    tracker.recordToolExecution({ toolName: 'getTodaySales', durationMs: 400, ok: true });

    const metrics = finalizeAiRequestMetrics({
      tracker,
      startedAt: Date.now() - 500,
      config: { provider: 'llama_cpp', model: 'Qwen/Qwen3-1.7B-GGUF' },
      status: 'success',
    });

    expect(metrics.overheadMs).toBe(0);
  });

  it('classifies timeout, rate limit, validation, and configuration errors', () => {
    expect(classifyAiChatError(new LlmTimeoutError())).toBe('timeout');
    expect(classifyAiChatError(new LlmProviderError('busy', 429))).toBe('rate_limit');
    expect(classifyAiChatError(new ApiError(429, 'AI rate limit exceeded'))).toBe('rate_limit');
    expect(classifyAiChatError(new LlmValidationError('bad message'))).toBe('validation_error');
    expect(classifyAiChatError(new LlmConfigError('missing key'))).toBe('configuration_error');
    expect(classifyAiChatError(new LlmProviderError('upstream', 502))).toBe('provider_error');
    expect(resolveAiRequestStatus(new LlmTimeoutError())).toBe('timeout');
    expect(resolveAiRequestStatus(new ApiError(429, 'AI rate limit exceeded'))).toBe('rate_limited');
  });

  it('counts tool validation failures without storing arguments', () => {
    const tracker = createAiRequestMetricsTracker({ requestId: 'req-4' });
    tracker.recordToolExecution({
      toolName: 'getTodaySales',
      durationMs: 20,
      ok: false,
      errorCode: 'TOOL_VALIDATION_FAILED',
    });

    const metrics = finalizeAiRequestMetrics({
      tracker,
      startedAt: Date.now() - 50,
      config: { provider: 'openai_compatible', model: 'openai/gpt-oss-20b' },
      status: 'success',
      error: undefined,
    });

    expect(metrics.toolValidationFailures).toBe(1);
    expect(JSON.stringify(metrics)).not.toContain('tenantId');
    expect(JSON.stringify(metrics)).not.toContain('arguments');
  });

  it('logs structured metrics without sensitive fields', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tracker = createAiRequestMetricsTracker({ requestId: 'req-safe' });
    tracker.promptGuardBlocked = true;

    logAiRequestMetrics(finalizeAiRequestMetrics({
      tracker,
      startedAt: Date.now() - 100,
      config: { provider: 'openai_compatible', model: 'openai/gpt-oss-20b' },
      status: 'blocked',
    }));

    const payload = String(logSpy.mock.calls[0]?.[1]);
    expect(payload).toContain('ai_chat_metrics');
    expect(payload).toContain('req-safe');
    expect(payload).not.toContain('apiKey');
    expect(payload).not.toContain('Bearer');
    expect(payload).not.toContain('cookie');
    expect(payload).not.toContain('ignore previous instructions');
    logSpy.mockRestore();
  });
});
