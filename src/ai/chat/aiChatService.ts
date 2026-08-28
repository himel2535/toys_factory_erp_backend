import { ApiError } from '../../utils/ApiError.js';
import { getLlmProvider } from '../client/llmClient.js';
import type { AiExecutionContext } from '../context/types.js';
import type { LLMProvider } from '../providers/types.js';
import type { LlmMessage, LlmToolCall } from '../types.js';
import { executeToolCall } from '../tools/toolExecutor.js';
import { registeredToolsToLlmDefinitions } from '../tools/llmToolBridge.js';
import type { ToolExecutionResult } from '../tools/types.js';
import { filterMessagesForProvider } from './buildLlmMessages.js';
import { toolResultContent } from './compressToolResult.js';
import { loadAiChatLimits } from './aiChatLimits.js';
import { ERP_AI_SECURITY_APPENDIX, ERP_AI_SYSTEM_PROMPT } from './systemPrompt.js';
import { createEmptyUsage, mergeUsage, type AiUsageTotals } from './aiRequestMetrics.js';

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
};

function buildSystemPrompt(): string {
  return `${ERP_AI_SYSTEM_PROMPT} ${ERP_AI_SECURITY_APPENDIX}`;
}

function toolCallCacheKey(toolCall: LlmToolCall): string {
  const name = String(toolCall.function?.name ?? '').trim();
  const args = String(toolCall.function?.arguments ?? '{}').trim() || '{}';
  return `${name}:${args}`;
}

function parseToolCallRange(toolCall: LlmToolCall): string | undefined {
  try {
    const parsed = JSON.parse(String(toolCall.function?.arguments ?? '{}')) as { range?: string };
    return parsed.range ? String(parsed.range) : undefined;
  } catch {
    return undefined;
  }
}

export async function runAiChat(input: RunAiChatInput): Promise<AiChatResult> {
  const { context, message, provider, env = process.env } = input;
  const llm = provider ?? getLlmProvider();
  const tools = registeredToolsToLlmDefinitions();
  const { maxToolRounds } = loadAiChatLimits(env);
  const system = buildSystemPrompt();

  const messages: LlmMessage[] = [{ role: 'user', content: message }];
  let toolRounds = 0;
  let providerMs = 0;
  let toolMs = 0;
  let toolCallCount = 0;
  let usage = createEmptyUsage();
  const toolResultCache = new Map<string, ToolExecutionResult>();

  while (true) {
    const roundStartedAt = Date.now();
    const providerMessages = filterMessagesForProvider(messages);
    console.log('[AI_CHAT] provider start', { toolRounds, messageCount: providerMessages.length });
    const response = await llm.generateWithTools({
      system,
      messages: providerMessages,
      tools,
      toolChoice: 'auto',
    });
    providerMs += Date.now() - roundStartedAt;
    usage = mergeUsage(usage, response.usage);
    console.log('[AI_CHAT] provider completed', {
      toolRounds,
      elapsedMs: Date.now() - roundStartedAt,
      finishReason: response.finishReason,
      toolCallCount: response.toolCalls.length,
      contentLength: response.content.length,
    });

    if (!response.toolCalls.length) {
      const answer = response.content.trim();
      return {
        message: answer || 'I could not generate a response.',
        metrics: {
          providerMs,
          toolMs,
          toolCallCount,
          toolRounds,
          usage,
        },
      };
    }

    toolRounds += 1;
    if (toolRounds > maxToolRounds) {
      throw new ApiError(429, 'Tool round limit exceeded');
    }

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      toolCalls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      const cacheKey = toolCallCacheKey(toolCall);
      let result = toolResultCache.get(cacheKey);
      if (result) {
        console.log('[AI_CHAT] duplicate tool skipped', {
          toolRounds,
          toolName: toolCall.function.name,
        });
      } else {
        const toolStartedAt = Date.now();
        console.log('[AI_CHAT] tool round', { toolRounds, toolName: toolCall.function.name });
        result = await executeToolCall(context, toolCall);
        toolMs += Date.now() - toolStartedAt;
        toolCallCount += 1;
        toolResultCache.set(cacheKey, result);
        console.log('[AI_CHAT] tool execution completed', {
          toolRounds,
          toolName: result.toolName,
          ok: result.ok,
          elapsedMs: Date.now() - toolStartedAt,
        });
      }

      const range = parseToolCallRange(toolCall);
      messages.push({
        role: 'tool',
        toolCallId: result.toolCallId,
        content: toolResultContent(result, { range, env }),
      });
    }
  }
}
