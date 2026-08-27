import { ApiError } from '../../utils/ApiError.js';
import { getLlmProvider } from '../client/llmClient.js';
import type { AiExecutionContext } from '../context/types.js';
import type { LLMProvider } from '../providers/types.js';
import type { LlmMessage } from '../types.js';
import { executeToolCall } from '../tools/toolExecutor.js';
import { registeredToolsToLlmDefinitions } from '../tools/llmToolBridge.js';
import type { ToolExecutionResult } from '../tools/types.js';
import { loadAiChatLimits } from './aiChatLimits.js';
import { ERP_AI_SYSTEM_PROMPT } from './systemPrompt.js';

export type AiChatResult = {
  message: string;
};

export type RunAiChatInput = {
  context: AiExecutionContext;
  message: string;
  provider?: LLMProvider;
  env?: NodeJS.ProcessEnv;
};

function toolResultContent(result: ToolExecutionResult): string {
  if (result.ok) {
    return JSON.stringify(result.data);
  }
  return JSON.stringify({ error: result.error });
}

export async function runAiChat(input: RunAiChatInput): Promise<AiChatResult> {
  const { context, message, provider, env = process.env } = input;
  const llm = provider ?? getLlmProvider();
  const tools = registeredToolsToLlmDefinitions();
  const { maxToolRounds } = loadAiChatLimits(env);

  const messages: LlmMessage[] = [{ role: 'user', content: message }];
  let toolRounds = 0;

  while (true) {
    const roundStartedAt = Date.now();
    console.log('[AI_CHAT] provider start', { toolRounds, messageCount: messages.length });
    const response = await llm.generateWithTools({
      system: ERP_AI_SYSTEM_PROMPT,
      messages,
      tools,
      toolChoice: 'auto',
    });
    console.log('[AI_CHAT] provider completed', {
      toolRounds,
      elapsedMs: Date.now() - roundStartedAt,
      finishReason: response.finishReason,
      toolCallCount: response.toolCalls.length,
      contentLength: response.content.length,
    });

    if (!response.toolCalls.length) {
      const answer = response.content.trim();
      return { message: answer || 'I could not generate a response.' };
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
      const toolStartedAt = Date.now();
      console.log('[AI_CHAT] tool round', { toolRounds, toolName: toolCall.function.name });
      const result = await executeToolCall(context, toolCall);
      console.log('[AI_CHAT] tool execution completed', {
        toolRounds,
        toolName: result.toolName,
        ok: result.ok,
        elapsedMs: Date.now() - toolStartedAt,
      });
      messages.push({
        role: 'tool',
        toolCallId: result.toolCallId,
        content: toolResultContent(result),
      });
    }
  }
}
