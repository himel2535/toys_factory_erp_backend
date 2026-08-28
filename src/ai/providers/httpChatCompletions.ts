import type {
  LlmCallOptions,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmGenerateWithToolsInput,
  LlmGenerateWithToolsResult,
  LlmToolCall,
} from '../types.js';
import { LlmProviderError, LlmTimeoutError } from '../errors.js';
import type { ProviderRuntimeConfig } from './types.js';

type ChatCompletionMessage = {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  chat_template_kwargs?: Record<string, unknown>;
  tools?: LlmGenerateWithToolsInput['tools'];
  tool_choice?: LlmGenerateWithToolsInput['toolChoice'];
};

type RawToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type RawChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning?: string | null;
      tool_calls?: RawToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

function buildMessages(input: LlmGenerateInput): ChatCompletionRequest['messages'] {
  const messages: ChatCompletionRequest['messages'] = [];
  if (input.system?.trim()) {
    messages.push({ role: 'system', content: input.system.trim() });
  }
  for (const message of input.messages) {
    const row: ChatCompletionMessage = {
      role: message.role,
      content: message.content,
    };
    if (message.name) row.name = message.name;
    if (message.role === 'tool' && message.toolCallId) {
      row.tool_call_id = message.toolCallId;
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      row.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      }));
    }
    messages.push(row);
  }
  return messages;
}

function normalizeToolCalls(raw: RawToolCall[] | undefined): LlmToolCall[] {
  if (!raw?.length) return [];
  return raw
    .map((call, index) => ({
      id: String(call.id ?? `tool_call_${index}`),
      type: 'function' as const,
      function: {
        name: String(call.function?.name ?? ''),
        arguments: String(call.function?.arguments ?? '{}'),
      },
    }))
    .filter((call) => call.function.name);
}

function normalizeUsage(raw: RawChatCompletionResponse['usage']) {
  if (!raw) return undefined;
  return {
    promptTokens: Number(raw.prompt_tokens ?? 0),
    completionTokens: Number(raw.completion_tokens ?? 0),
    totalTokens: Number(raw.total_tokens ?? 0),
  };
}

function normalizeProviderText(value: unknown): string {
  if (typeof value === 'string') return value;
  return '';
}

function mergeAbortSignals(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message === 'timeout';
}

export async function postChatCompletions(
  config: ProviderRuntimeConfig,
  input: LlmGenerateInput,
  options?: LlmCallOptions & { tools?: LlmGenerateWithToolsInput['tools']; toolChoice?: LlmGenerateWithToolsInput['toolChoice'] },
): Promise<LlmGenerateWithToolsResult> {
  const url = `${config.baseUrl}/chat/completions`;
  const body: ChatCompletionRequest = {
    model: input.model ?? config.model,
    messages: buildMessages(input),
  };
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (options?.tools?.length) {
    body.tools = options.tools;
    if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  }
  if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;
  if (config.chatTemplateKwargs) body.chat_template_kwargs = config.chatTemplateKwargs;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const { signal, cleanup } = mergeAbortSignals(config.timeoutMs, options?.signal);
  try {
    if (config.debug) {
      console.log(`[ai] POST ${url} model=${body.model} messages=${body.messages.length}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    const rawText = await response.text();
    let payload: RawChatCompletionResponse | null = null;
    try {
      payload = rawText ? JSON.parse(rawText) as RawChatCompletionResponse : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error?.message ?? (rawText.slice(0, 300) || `HTTP ${response.status}`);
      throw new LlmProviderError(message, response.status, payload ?? rawText);
    }

    if (rawText && payload === null) {
      throw new LlmProviderError('Invalid provider response', 502);
    }

    if (!payload?.choices?.length) {
      throw new LlmProviderError('Invalid provider response', 502);
    }

    const choice = payload.choices[0];
    const message = choice?.message;
    const rawToolCalls = message?.tool_calls;
    const toolCalls = normalizeToolCalls(rawToolCalls);

    if (
      (choice?.finish_reason === 'tool_calls' || (rawToolCalls?.length ?? 0) > 0)
      && toolCalls.length === 0
    ) {
      throw new LlmProviderError('Invalid provider response', 502);
    }
    let content = normalizeProviderText(message?.content);
    if (!content.trim() && !toolCalls.length) {
      const reasoning = normalizeProviderText(message?.reasoning).trim();
      if (reasoning) content = reasoning;
    }

    const result: LlmGenerateWithToolsResult = {
      content,
      finishReason: choice?.finish_reason,
      usage: normalizeUsage(payload?.usage),
      toolCalls,
      raw: payload,
    };
    return result;
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new LlmTimeoutError();
    }
    throw error;
  } finally {
    cleanup();
  }
}

export async function postChatCompletionsGenerate(
  config: ProviderRuntimeConfig,
  input: LlmGenerateInput,
  options?: LlmCallOptions,
): Promise<LlmGenerateResult> {
  const result = await postChatCompletions(config, input, options);
  return {
    content: result.content,
    finishReason: result.finishReason,
    usage: result.usage,
    raw: result.raw,
  };
}
