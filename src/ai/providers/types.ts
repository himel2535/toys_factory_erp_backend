import type {
  AiProviderId,
  LlmCallOptions,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmGenerateWithToolsInput,
  LlmGenerateWithToolsResult,
} from '../types.js';

export interface LLMProvider {
  readonly providerId: AiProviderId;
  generate(input: LlmGenerateInput, options?: LlmCallOptions): Promise<LlmGenerateResult>;
  generateWithTools(
    input: LlmGenerateWithToolsInput,
    options?: LlmCallOptions,
  ): Promise<LlmGenerateWithToolsResult>;
}

export type ProviderRuntimeConfig = {
  providerId: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  debug: boolean;
  supportsTools: boolean;
  /** Cap completion length for local models (llama.cpp). */
  maxTokens?: number;
  /** Passed to llama.cpp chat_template_kwargs (e.g. Qwen3 enable_thinking). */
  chatTemplateKwargs?: Record<string, unknown>;
};
