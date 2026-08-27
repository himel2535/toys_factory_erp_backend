import type {
  LlmCallOptions,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmGenerateWithToolsInput,
  LlmGenerateWithToolsResult,
} from '../types.js';
import type { LLMProvider, ProviderRuntimeConfig } from './types.js';
import { postChatCompletions, postChatCompletionsGenerate } from './httpChatCompletions.js';

/**
 * llama.cpp server exposing OpenAI-compatible POST /v1/chat/completions.
 * Uses the same HTTP normalization as openai_compatible with llama-specific defaults.
 */
export function createLlamaCppProvider(config: ProviderRuntimeConfig): LLMProvider {
  return {
    providerId: 'llama_cpp',
    generate(input: LlmGenerateInput, options?: LlmCallOptions): Promise<LlmGenerateResult> {
      return postChatCompletionsGenerate(config, input, options);
    },
    async generateWithTools(
      input: LlmGenerateWithToolsInput,
      options?: LlmCallOptions,
    ): Promise<LlmGenerateWithToolsResult> {
      const result = await postChatCompletions(config, input, {
        ...options,
        tools: input.tools,
        toolChoice: input.toolChoice,
      });
      return {
        ...result,
        toolCalls: result.toolCalls ?? [],
      };
    },
  };
}
