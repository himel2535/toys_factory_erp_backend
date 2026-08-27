import type { AiConfigEnabled } from '../config/aiConfig.js';
import { LlmConfigError } from '../errors.js';
import type { LLMProvider } from './types.js';
import { createOpenAiCompatibleProvider } from './openaiCompatibleProvider.js';
import { createLlamaCppProvider } from './llamaCppProvider.js';

export function createLlmProvider(config: AiConfigEnabled): LLMProvider {
  const runtime = {
    providerId: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    debug: config.debug,
    supportsTools: true,
  };

  switch (config.provider) {
    case 'openai_compatible':
      return createOpenAiCompatibleProvider(runtime);
    case 'llama_cpp':
      return createLlamaCppProvider({
        ...runtime,
        maxTokens: 512,
        chatTemplateKwargs: { enable_thinking: false },
      });
    default:
      throw new LlmConfigError(`Unsupported AI provider: ${String(config.provider)}`);
  }
}
