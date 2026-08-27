export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export type LlmMessage = {
  role: LlmRole;
  content: string;
  name?: string;
  toolCallId?: string;
  /** Assistant replay after tool execution — sent as provider tool_calls. */
  toolCalls?: LlmToolCall[];
};

export type LlmToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type LlmToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type LlmGenerateInput = {
  messages: LlmMessage[];
  system?: string;
  model?: string;
  temperature?: number;
};

export type LlmGenerateWithToolsInput = LlmGenerateInput & {
  tools: LlmToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type LlmGenerateResult = {
  content: string;
  finishReason?: string;
  usage?: LlmTokenUsage;
  raw?: unknown;
};

export type LlmGenerateWithToolsResult = LlmGenerateResult & {
  toolCalls: LlmToolCall[];
};

export type LlmCallOptions = {
  signal?: AbortSignal;
};

export type AiProviderId = 'openai_compatible' | 'llama_cpp';
