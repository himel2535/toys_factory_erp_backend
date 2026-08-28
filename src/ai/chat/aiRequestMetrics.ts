import { randomUUID } from 'node:crypto';
import { ApiError } from '../../utils/ApiError.js';
import {
  LlmConfigError,
  LlmError,
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from '../errors.js';
import type { ToolErrorCode } from '../tools/errors.js';

export type AiUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiRequestStatus = 'success' | 'error' | 'timeout' | 'rate_limited' | 'blocked';

export type AiErrorCategory =
  | 'timeout'
  | 'rate_limit'
  | 'provider_error'
  | 'tool_error'
  | 'validation_error'
  | 'configuration_error'
  | 'unknown';

export type AiToolMetric = {
  toolName: string;
  callCount: number;
  totalMs: number;
  failureCount: number;
  averageMs: number;
};

export type AiRequestMetrics = {
  requestId: string;
  timestamp: string;
  provider: string;
  model: string;
  status: AiRequestStatus;
  errorCategory?: AiErrorCategory;
  totalMs: number;
  providerMs: number;
  toolMs: number;
  overheadMs: number;
  providerCallCount: number;
  toolCallCount: number;
  toolRounds: number;
  toolTotalMs: number;
  tools: AiToolMetric[];
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptGuardBlocked: boolean;
  toolValidationFailures: number;
};

type ToolObservation = {
  toolName: string;
  durationMs: number;
  ok: boolean;
  errorCode?: ToolErrorCode;
};

export type AiRequestMetricsTracker = {
  requestId: string;
  providerMs: number;
  toolMs: number;
  providerCallCount: number;
  toolCallCount: number;
  toolRounds: number;
  usage: AiUsageTotals;
  usageObserved: boolean;
  promptGuardBlocked: boolean;
  toolValidationFailures: number;
  toolObservations: ToolObservation[];
  recordProviderCall(durationMs: number, usage?: Partial<AiUsageTotals>): void;
  recordToolRound(): void;
  recordToolExecution(input: {
    toolName: string;
    durationMs: number;
    ok: boolean;
    errorCode?: ToolErrorCode;
    skippedDuplicate?: boolean;
  }): void;
};

type FinalizeInput = {
  tracker: AiRequestMetricsTracker;
  startedAt: number;
  config: { provider: string; model: string };
  status: AiRequestStatus;
  error?: unknown;
};

export function createAiRequestId(): string {
  return randomUUID();
}

export function createEmptyUsage(): AiUsageTotals {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function mergeUsage(
  current: AiUsageTotals,
  next?: Partial<AiUsageTotals>,
): AiUsageTotals {
  if (!next) return current;
  return {
    promptTokens: current.promptTokens + Number(next.promptTokens ?? 0),
    completionTokens: current.completionTokens + Number(next.completionTokens ?? 0),
    totalTokens: current.totalTokens + Number(next.totalTokens ?? 0),
  };
}

export function usageHasValues(usage: AiUsageTotals): boolean {
  return usage.promptTokens > 0 || usage.completionTokens > 0 || usage.totalTokens > 0;
}

function computeOverheadMs(totalMs: number, providerMs: number, toolMs: number): number {
  return Math.max(0, totalMs - providerMs - toolMs);
}

function buildToolMetrics(observations: ToolObservation[]): AiToolMetric[] {
  const byName = new Map<string, { callCount: number; totalMs: number; failureCount: number }>();

  for (const observation of observations) {
    const existing = byName.get(observation.toolName) ?? {
      callCount: 0,
      totalMs: 0,
      failureCount: 0,
    };
    existing.callCount += 1;
    existing.totalMs += observation.durationMs;
    if (!observation.ok) existing.failureCount += 1;
    byName.set(observation.toolName, existing);
  }

  return Array.from(byName.entries()).map(([toolName, stats]) => ({
    toolName,
    callCount: stats.callCount,
    totalMs: stats.totalMs,
    failureCount: stats.failureCount,
    averageMs: stats.callCount > 0 ? Math.round(stats.totalMs / stats.callCount) : 0,
  }));
}

export function createAiRequestMetricsTracker(input: { requestId: string }): AiRequestMetricsTracker {
  const state = {
    requestId: input.requestId,
    providerMs: 0,
    toolMs: 0,
    providerCallCount: 0,
    toolCallCount: 0,
    toolRounds: 0,
    usage: createEmptyUsage(),
    usageObserved: false,
    promptGuardBlocked: false,
    toolValidationFailures: 0,
    toolObservations: [] as ToolObservation[],
  };

  return {
    get requestId() {
      return state.requestId;
    },
    get providerMs() {
      return state.providerMs;
    },
    get toolMs() {
      return state.toolMs;
    },
    get providerCallCount() {
      return state.providerCallCount;
    },
    get toolCallCount() {
      return state.toolCallCount;
    },
    get toolRounds() {
      return state.toolRounds;
    },
    get usage() {
      return state.usage;
    },
    get usageObserved() {
      return state.usageObserved;
    },
    get promptGuardBlocked() {
      return state.promptGuardBlocked;
    },
    set promptGuardBlocked(value: boolean) {
      state.promptGuardBlocked = value;
    },
    get toolValidationFailures() {
      return state.toolValidationFailures;
    },
    get toolObservations() {
      return state.toolObservations;
    },
    recordProviderCall(durationMs: number, usage?: Partial<AiUsageTotals>) {
      state.providerMs += durationMs;
      state.providerCallCount += 1;
      if (usage) {
        state.usage = mergeUsage(state.usage, usage);
        state.usageObserved = true;
      }
    },
    recordToolRound() {
      state.toolRounds += 1;
    },
    recordToolExecution(input: {
      toolName: string;
      durationMs: number;
      ok: boolean;
      errorCode?: ToolErrorCode;
      skippedDuplicate?: boolean;
    }) {
      if (input.skippedDuplicate) return;
      state.toolMs += input.durationMs;
      state.toolCallCount += 1;
      if (input.errorCode === 'TOOL_VALIDATION_FAILED') {
        state.toolValidationFailures += 1;
      }
      state.toolObservations.push({
        toolName: input.toolName,
        durationMs: input.durationMs,
        ok: input.ok,
        errorCode: input.errorCode,
      });
    },
  };
}

export function classifyAiChatError(error: unknown): AiErrorCategory {
  if (error instanceof ApiError) {
    if (error.statusCode === 429) {
      if (error.message === 'AI rate limit exceeded' || error.message === 'Tool round limit exceeded') {
        return 'rate_limit';
      }
      return 'rate_limit';
    }
    if (error.statusCode === 400) return 'validation_error';
    if (error.statusCode === 503 && error.message === 'AI is not enabled') {
      return 'configuration_error';
    }
    return 'unknown';
  }
  if (error instanceof LlmValidationError) return 'validation_error';
  if (error instanceof LlmConfigError) return 'configuration_error';
  if (error instanceof LlmTimeoutError) return 'timeout';
  if (error instanceof LlmProviderError) {
    if (error.statusCode === 429) return 'rate_limit';
    return 'provider_error';
  }
  if (error instanceof LlmError) return 'provider_error';
  return 'unknown';
}

export function resolveAiRequestStatus(error: unknown): AiRequestStatus {
  const category = classifyAiChatError(error);
  if (category === 'timeout') return 'timeout';
  if (category === 'rate_limit') return 'rate_limited';
  if (category === 'validation_error' || category === 'configuration_error' || category === 'provider_error' || category === 'tool_error' || category === 'unknown') {
    return 'error';
  }
  return 'error';
}

export function finalizeAiRequestMetrics(input: FinalizeInput): AiRequestMetrics {
  const { tracker, startedAt, config, status, error } = input;
  const totalMs = Date.now() - startedAt;
  const providerMs = tracker.providerMs;
  const toolMs = tracker.toolMs;
  const tokens = tracker.usageObserved
    ? {
        promptTokens: tracker.usage.promptTokens,
        completionTokens: tracker.usage.completionTokens,
        totalTokens: tracker.usage.totalTokens,
      }
    : {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      };

  return {
    requestId: tracker.requestId,
    timestamp: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    status,
    errorCategory: error ? classifyAiChatError(error) : undefined,
    totalMs,
    providerMs,
    toolMs,
    overheadMs: computeOverheadMs(totalMs, providerMs, toolMs),
    providerCallCount: tracker.providerCallCount,
    toolCallCount: tracker.toolCallCount,
    toolRounds: tracker.toolRounds,
    toolTotalMs: toolMs,
    tools: buildToolMetrics(tracker.toolObservations),
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    totalTokens: tokens.totalTokens,
    promptGuardBlocked: tracker.promptGuardBlocked,
    toolValidationFailures: tracker.toolValidationFailures,
  };
}

export function logAiRequestMetrics(metrics: AiRequestMetrics): void {
  console.log('[AI_CHAT] metrics', JSON.stringify({
    event: 'ai_chat_metrics',
    requestId: metrics.requestId,
    timestamp: metrics.timestamp,
    provider: metrics.provider,
    model: metrics.model,
    status: metrics.status,
    errorCategory: metrics.errorCategory,
    totalMs: metrics.totalMs,
    providerMs: metrics.providerMs,
    toolMs: metrics.toolMs,
    overheadMs: metrics.overheadMs,
    providerCallCount: metrics.providerCallCount,
    toolCallCount: metrics.toolCallCount,
    toolRounds: metrics.toolRounds,
    toolTotalMs: metrics.toolTotalMs,
    tools: metrics.tools,
    promptTokens: metrics.promptTokens,
    completionTokens: metrics.completionTokens,
    totalTokens: metrics.totalTokens,
    promptGuardBlocked: metrics.promptGuardBlocked,
    toolValidationFailures: metrics.toolValidationFailures,
  }));
}
