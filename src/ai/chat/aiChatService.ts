import { ApiError } from '../../utils/ApiError.js';
import { getLlmProvider } from '../client/llmClient.js';
import type { AiExecutionContext } from '../context/types.js';
import type { LLMProvider } from '../providers/types.js';
import type { LlmMessage, LlmToolCall } from '../types.js';
import { executeToolCall } from '../tools/toolExecutor.js';
import type { ToolErrorCode } from '../tools/errors.js';
import { registeredToolsToLlmDefinitions } from '../tools/llmToolBridge.js';
import type { ToolExecutionResult } from '../tools/types.js';
import { filterMessagesForProvider } from './buildLlmMessages.js';
import { toolResultContent } from './compressToolResult.js';
import { loadAiChatLimits } from './aiChatLimits.js';
import { ERP_AI_SECURITY_APPENDIX, ERP_AI_SYSTEM_PROMPT } from './systemPrompt.js';
import {
  createAiRequestMetricsTracker,
  type AiRequestMetricsTracker,
  type AiUsageTotals,
} from './aiRequestMetrics.js';

export type AiChatResult = {
  message: string;
  metrics: {
    providerMs: number;
    toolMs: number;
    toolCallCount: number;
    toolRounds: number;
    usage: AiUsageTotals;
  };
};

export type RunAiChatInput = {
  context: AiExecutionContext;
  message: string;
  provider?: LLMProvider;
  env?: NodeJS.ProcessEnv;
  metricsTracker?: AiRequestMetricsTracker;
  requestId?: string;
};

function buildSystemPrompt(): string {
  return `${ERP_AI_SYSTEM_PROMPT} ${ERP_AI_SECURITY_APPENDIX}`;
}

function normalizeFinalAnswer(content: string): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed === '[object Object]') {
    return '';
  }
  return trimmed;
}

function stableToolArgsKey(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        normalized[key] = record[key];
      }
      return JSON.stringify(normalized);
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

function toolCallCacheKey(toolCall: LlmToolCall): string {
  const name = String(toolCall.function?.name ?? '').trim();
  const args = String(toolCall.function?.arguments ?? '{}').trim() || '{}';
  return `${name}:${stableToolArgsKey(args)}`;
}

function parseToolCallRange(toolCall: LlmToolCall): string | undefined {
  try {
    const parsed = JSON.parse(String(toolCall.function?.arguments ?? '{}')) as { range?: string };
    return parsed.range ? String(parsed.range) : undefined;
  } catch {
    return undefined;
  }
}

type ToolRoundResult = {
  result: ToolExecutionResult;
  range?: string;
};

async function executeToolCallsForRound(
  context: AiExecutionContext,
  toolCalls: LlmToolCall[],
  toolResultCache: Map<string, ToolExecutionResult>,
  tracker: AiRequestMetricsTracker,
  toolRounds: number,
): Promise<ToolRoundResult[]> {
  const cachedBeforeRound = new Set<string>();
  const uniqueUncached = new Map<string, LlmToolCall>();

  for (const toolCall of toolCalls) {
    const cacheKey = toolCallCacheKey(toolCall);
    if (toolResultCache.has(cacheKey)) {
      cachedBeforeRound.add(cacheKey);
    } else if (!uniqueUncached.has(cacheKey)) {
      uniqueUncached.set(cacheKey, toolCall);
    }
  }

  if (uniqueUncached.size > 0) {
    await Promise.all([...uniqueUncached.entries()].map(async ([cacheKey, toolCall]) => {
      const toolStartedAt = Date.now();
      console.log('[AI_CHAT] tool round', {
        requestId: tracker.requestId,
        toolRounds,
        toolName: toolCall.function.name,
      });
      const result = await executeToolCall(context, toolCall);
      const toolElapsedMs = Date.now() - toolStartedAt;
      toolResultCache.set(cacheKey, result);
      tracker.recordToolExecution({
        toolName: result.toolName,
        durationMs: toolElapsedMs,
        ok: result.ok,
        errorCode: result.error?.code as ToolErrorCode | undefined,
      });
      console.log('[AI_CHAT] tool execution completed', {
        requestId: tracker.requestId,
        toolRounds,
        toolName: result.toolName,
        ok: result.ok,
        elapsedMs: toolElapsedMs,
      });
    }));
  }

  const seenThisRound = new Set<string>();
  return toolCalls.map((toolCall) => {
    const cacheKey = toolCallCacheKey(toolCall);
    const result = toolResultCache.get(cacheKey);
    if (!result) {
      throw new Error(`Missing tool result for ${toolCall.function.name}`);
    }

    const skippedDuplicate = cachedBeforeRound.has(cacheKey) || seenThisRound.has(cacheKey);
    if (skippedDuplicate) {
      console.log('[AI_CHAT] duplicate tool skipped', {
        requestId: tracker.requestId,
        toolRounds,
        toolName: toolCall.function.name,
      });
      tracker.recordToolExecution({
        toolName: toolCall.function.name,
        durationMs: 0,
        ok: result.ok,
        errorCode: result.error?.code as ToolErrorCode | undefined,
        skippedDuplicate: true,
      });
    }
    seenThisRound.add(cacheKey);

    return {
      result,
      range: parseToolCallRange(toolCall),
    };
  });
}

export async function runAiChat(input: RunAiChatInput): Promise<AiChatResult> {
  const { context, message, provider, env = process.env, requestId } = input;
  const tracker = input.metricsTracker ?? createAiRequestMetricsTracker({
    requestId: requestId ?? 'internal',
  });
  const llm = provider ?? getLlmProvider();
  const tools = registeredToolsToLlmDefinitions();
  const { maxToolRounds } = loadAiChatLimits(env);
  const system = buildSystemPrompt();

  const messages: LlmMessage[] = [{ role: 'user', content: message }];
  let toolRounds = 0;
  const toolResultCache = new Map<string, ToolExecutionResult>();

  while (true) {
    const roundStartedAt = Date.now();
    const providerMessages = filterMessagesForProvider(messages);
    console.log('[AI_CHAT] provider start', {
      requestId: tracker.requestId,
      toolRounds,
      messageCount: providerMessages.length,
    });
    const response = await llm.generateWithTools({
      system,
      messages: providerMessages,
      tools,
      toolChoice: 'auto',
    });
    const providerElapsedMs = Date.now() - roundStartedAt;
    tracker.recordProviderCall(providerElapsedMs, response.usage);
    console.log('[AI_CHAT] provider completed', {
      requestId: tracker.requestId,
      toolRounds,
      elapsedMs: providerElapsedMs,
      finishReason: response.finishReason,
      toolCallCount: response.toolCalls.length,
      contentLength: response.content.length,
    });

    if (!response.toolCalls.length) {
      const answer = normalizeFinalAnswer(response.content);
      return {
        message: answer || 'I could not generate a response.',
        metrics: {
          providerMs: tracker.providerMs,
          toolMs: tracker.toolMs,
          toolCallCount: tracker.toolCallCount,
          toolRounds: tracker.toolRounds,
          usage: tracker.usage,
        },
      };
    }

    toolRounds += 1;
    tracker.recordToolRound();
    if (toolRounds > maxToolRounds) {
      throw new ApiError(429, 'Tool round limit exceeded');
    }

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      toolCalls: response.toolCalls,
    });

    const roundResults = await executeToolCallsForRound(
      context,
      response.toolCalls,
      toolResultCache,
      tracker,
      toolRounds,
    );

    for (let i = 0; i < response.toolCalls.length; i += 1) {
      const toolCall = response.toolCalls[i]!;
      const { result, range } = roundResults[i]!;
      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: toolResultContent(result, { range, env }),
      });
    }
  }
}
