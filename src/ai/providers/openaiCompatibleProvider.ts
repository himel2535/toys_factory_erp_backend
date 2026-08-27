import type {
  LlmCallOptions,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmGenerateWithToolsInput,
  LlmGenerateWithToolsResult,
} from '../types.js';
import { LlmProviderError } from '../errors.js';
import type { LLMProvider, ProviderRuntimeConfig } from './types.js';
import { postChatCompletions, postChatCompletionsGenerate } from './httpChatCompletions.js';

export function createOpenAiCompatibleProvider(config: ProviderRuntimeConfig): LLMProvider {
  return {
    providerId: 'openai_compatible',
    generate(input: LlmGenerateInput, options?: LlmCallOptions): Promise<LlmGenerateResult> {
      return postChatCompletionsGenerate(config, input, options);
    },
    generateWithTools(
      input: LlmGenerateWithToolsInput,
      options?: LlmCallOptions,
    ): Promise<LlmGenerateWithToolsResult> {
      if (!config.supportsTools) {
        throw new LlmProviderError('Tool calling is not supported by this provider configuration');
      }
      return postChatCompletions(config, input, {
        ...options,
        tools: input.tools,
        toolChoice: input.toolChoice,
      });
    },
  };
}
