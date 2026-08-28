import type { AiRequestMetrics } from './aiRequestMetrics.js';

const MAX_PROVIDER_MODEL_KEYS = 16;
const MAX_TOOL_KEYS = 32;

type ProviderModelKey = string;

type AggregateCounters = {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  rateLimitedRequests: number;
  blockedRequests: number;
  totalProviderMs: number;
  totalToolMs: number;
  totalRequestMs: number;
  totalTokens: number;
  requestsWithTokens: number;
  totalToolCalls: number;
  promptGuardBlocks: number;
  toolValidationFailures: number;
};

type ProviderModelAggregate = {
  provider: string;
  model: string;
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  totalProviderMs: number;
  totalToolMs: number;
  totalRequestMs: number;
  totalTokens: number;
  requestsWithTokens: number;
};

type ToolAggregate = {
  toolName: string;
  callCount: number;
  totalMs: number;
  failureCount: number;
};

const counters: AggregateCounters = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0,
  rateLimitedRequests: 0,
  blockedRequests: 0,
  totalProviderMs: 0,
  totalToolMs: 0,
  totalRequestMs: 0,
  totalTokens: 0,
  requestsWithTokens: 0,
  totalToolCalls: 0,
  promptGuardBlocks: 0,
  toolValidationFailures: 0,
};

const providerModelAggregates = new Map<ProviderModelKey, ProviderModelAggregate>();
const toolAggregates = new Map<string, ToolAggregate>();

function providerModelKey(provider: string, model: string): ProviderModelKey {
  return `${provider}::${model}`;
}

function ensureProviderModelAggregate(provider: string, model: string): ProviderModelAggregate | null {
  const key = providerModelKey(provider, model);
  const existing = providerModelAggregates.get(key);
  if (existing) return existing;
  if (providerModelAggregates.size >= MAX_PROVIDER_MODEL_KEYS) return null;

  const created: ProviderModelAggregate = {
    provider,
    model,
    requestCount: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalProviderMs: 0,
    totalToolMs: 0,
    totalRequestMs: 0,
    totalTokens: 0,
    requestsWithTokens: 0,
  };
  providerModelAggregates.set(key, created);
  return created;
}

function ensureToolAggregate(toolName: string): ToolAggregate | null {
  const existing = toolAggregates.get(toolName);
  if (existing) return existing;
  if (toolAggregates.size >= MAX_TOOL_KEYS) return null;

  const created: ToolAggregate = {
    toolName,
    callCount: 0,
    totalMs: 0,
    failureCount: 0,
  };
  toolAggregates.set(toolName, created);
  return created;
}

function safeAverage(total: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(total / count);
}

export function recordAiRequestMetrics(metrics: AiRequestMetrics): void {
  counters.totalRequests += 1;
  counters.totalProviderMs += metrics.providerMs;
  counters.totalToolMs += metrics.toolMs;
  counters.totalRequestMs += metrics.totalMs;
  counters.totalToolCalls += metrics.toolCallCount;
  counters.toolValidationFailures += metrics.toolValidationFailures;

  if (metrics.promptGuardBlocked) counters.promptGuardBlocks += 1;

  if (metrics.status === 'success') counters.successfulRequests += 1;
  else counters.failedRequests += 1;

  if (metrics.status === 'timeout') counters.timeouts += 1;
  if (metrics.status === 'rate_limited') counters.rateLimitedRequests += 1;
  if (metrics.status === 'blocked') counters.blockedRequests += 1;

  if (metrics.totalTokens !== null) {
    counters.totalTokens += metrics.totalTokens;
    counters.requestsWithTokens += 1;
  }

  const providerAgg = ensureProviderModelAggregate(metrics.provider, metrics.model);
  if (providerAgg) {
    providerAgg.requestCount += 1;
    providerAgg.totalProviderMs += metrics.providerMs;
    providerAgg.totalToolMs += metrics.toolMs;
    if (metrics.status === 'success') providerAgg.successfulRequests += 1;
    else providerAgg.failedRequests += 1;
    if (metrics.totalTokens !== null) {
      providerAgg.totalTokens += metrics.totalTokens;
      providerAgg.requestsWithTokens += 1;
    }
  }

  for (const tool of metrics.tools) {
    const toolAgg = ensureToolAggregate(tool.toolName);
    if (!toolAgg) continue;
    toolAgg.callCount += tool.callCount;
    toolAgg.totalMs += tool.totalMs;
    toolAgg.failureCount += tool.failureCount;
  }
}

export type AiMetricsSnapshot = {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  rateLimitedRequests: number;
  blockedRequests: number;
  promptGuardBlocks: number;
  toolValidationFailures: number;
  totalToolCalls: number;
  successRate: number;
  averageLatencyMs: number;
  averageProviderLatencyMs: number;
  averageToolLatencyMs: number;
  averageTokens: number | null;
  providers: Array<{
    provider: string;
    model: string;
    requestCount: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageProviderLatencyMs: number;
    averageToolLatencyMs: number;
    averageTokens: number | null;
  }>;
  tools: Array<{
    toolName: string;
    callCount: number;
    totalMs: number;
    failureCount: number;
    averageMs: number;
  }>;
};

export function getAiMetricsSnapshot(): AiMetricsSnapshot {
  return {
    totalRequests: counters.totalRequests,
    successfulRequests: counters.successfulRequests,
    failedRequests: counters.failedRequests,
    timeouts: counters.timeouts,
    rateLimitedRequests: counters.rateLimitedRequests,
    blockedRequests: counters.blockedRequests,
    promptGuardBlocks: counters.promptGuardBlocks,
    toolValidationFailures: counters.toolValidationFailures,
    totalToolCalls: counters.totalToolCalls,
    successRate: counters.totalRequests > 0
      ? Number((counters.successfulRequests / counters.totalRequests).toFixed(4))
      : 0,
    averageLatencyMs: safeAverage(counters.totalRequestMs, counters.totalRequests),
    averageProviderLatencyMs: safeAverage(counters.totalProviderMs, counters.totalRequests),
    averageToolLatencyMs: safeAverage(counters.totalToolMs, counters.totalRequests),
    averageTokens: counters.requestsWithTokens > 0
      ? safeAverage(counters.totalTokens, counters.requestsWithTokens)
      : null,
    providers: Array.from(providerModelAggregates.values()).map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      requestCount: entry.requestCount,
      successfulRequests: entry.successfulRequests,
      failedRequests: entry.failedRequests,
      successRate: entry.requestCount > 0
        ? Number((entry.successfulRequests / entry.requestCount).toFixed(4))
        : 0,
      averageProviderLatencyMs: safeAverage(entry.totalProviderMs, entry.requestCount),
      averageToolLatencyMs: safeAverage(entry.totalToolMs, entry.requestCount),
      averageTokens: entry.requestsWithTokens > 0
        ? safeAverage(entry.totalTokens, entry.requestsWithTokens)
        : null,
    })),
    tools: Array.from(toolAggregates.values()).map((entry) => ({
      toolName: entry.toolName,
      callCount: entry.callCount,
      totalMs: entry.totalMs,
      failureCount: entry.failureCount,
      averageMs: safeAverage(entry.totalMs, entry.callCount),
    })),
  };
}

export function resetAiMetricsAggregatorForTests(): void {
  counters.totalRequests = 0;
  counters.successfulRequests = 0;
  counters.failedRequests = 0;
  counters.timeouts = 0;
  counters.rateLimitedRequests = 0;
  counters.blockedRequests = 0;
  counters.totalProviderMs = 0;
  counters.totalToolMs = 0;
  counters.totalRequestMs = 0;
  counters.totalTokens = 0;
  counters.requestsWithTokens = 0;
  counters.totalToolCalls = 0;
  counters.promptGuardBlocks = 0;
  counters.toolValidationFailures = 0;
  providerModelAggregates.clear();
  toolAggregates.clear();
}
