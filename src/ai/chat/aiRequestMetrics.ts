export type AiUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiRequestMetrics = {
  totalMs: number;
  providerMs: number;
  toolMs: number;
  toolCallCount: number;
  toolRounds: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptGuardBlocked: boolean;
};

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

export function buildAiRequestMetrics(input: Omit<AiRequestMetrics, 'promptTokens' | 'completionTokens' | 'totalTokens'> & AiUsageTotals): AiRequestMetrics {
  return {
    totalMs: input.totalMs,
    providerMs: input.providerMs,
    toolMs: input.toolMs,
    toolCallCount: input.toolCallCount,
    toolRounds: input.toolRounds,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    promptGuardBlocked: input.promptGuardBlocked,
  };
}

export function logAiRequestMetrics(metrics: AiRequestMetrics): void {
  console.log('[AI_CHAT] metrics', JSON.stringify({
    event: 'ai_chat_metrics',
    totalMs: metrics.totalMs,
    providerMs: metrics.providerMs,
    toolMs: metrics.toolMs,
    toolCallCount: metrics.toolCallCount,
    toolRounds: metrics.toolRounds,
    promptTokens: metrics.promptTokens,
    completionTokens: metrics.completionTokens,
    totalTokens: metrics.totalTokens,
    promptGuardBlocked: metrics.promptGuardBlocked,
  }));
}
