import type { LLMProvider } from '../../../../src/ai/providers/types.js';
import type { LlmGenerateWithToolsInput, LlmGenerateWithToolsResult } from '../../../../src/ai/types.js';

export type ExecutedToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type ScriptedProvider = LLMProvider & {
  calls: LlmGenerateWithToolsInput[];
  requestedToolCalls: ExecutedToolCall[];
};

export function createScriptedProvider(
  responses: LlmGenerateWithToolsResult[],
): ScriptedProvider {
  const calls: LlmGenerateWithToolsInput[] = [];
  const requestedToolCalls: ExecutedToolCall[] = [];
  let index = 0;

  return {
    providerId: 'openai_compatible',
    calls,
    requestedToolCalls,
    async generate() {
      throw new Error('generate() not used in evaluation');
    },
    async generateWithTools(input) {
      calls.push(input);
      const response = responses[index];
      index += 1;
      if (!response) {
        throw new Error(`unexpected LLM call at index ${index - 1}`);
      }
      for (const call of response.toolCalls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = { __parseError: true };
        }
        requestedToolCalls.push({ name: call.function.name, args });
      }
      return response;
    },
  };
}

export function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {},
): LlmGenerateWithToolsResult {
  return {
    content: '',
    toolCalls: [{
      id,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    }],
  };
}

export function finalAnswer(
  content: string,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): LlmGenerateWithToolsResult {
  return {
    content,
    toolCalls: [],
    usage,
  };
}

export function duplicateToolRound(
  name: string,
  args: Record<string, unknown> = {},
): LlmGenerateWithToolsResult {
  return {
    content: '',
    toolCalls: [
      { id: 'dup_a', type: 'function', function: { name, arguments: JSON.stringify(args) } },
      { id: 'dup_b', type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ],
  };
}
