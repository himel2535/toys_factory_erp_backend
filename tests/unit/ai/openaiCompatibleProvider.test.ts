import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from '../../../src/ai/providers/openaiCompatibleProvider.js';
import { LlmProviderError, LlmTimeoutError } from '../../../src/ai/errors.js';

const groqRuntime = {
  providerId: 'openai_compatible' as const,
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: 'groq-test-key',
  model: 'openai/gpt-oss-20b',
  timeoutMs: 60_000,
  debug: false,
  supportsTools: true,
  maxTokens: 768,
};

const runtime = {
  providerId: 'openai_compatible' as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-test',
  timeoutMs: 1000,
  debug: false,
  supportsTools: true,
};

describe('openaiCompatibleProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes chat completion responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
    }));

    const provider = createOpenAiCompatibleProvider(runtime);
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are helpful',
      temperature: 0.2,
    });

    expect(result.content).toBe('Hello');
    expect(result.usage).toEqual({
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('gpt-test');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(body.temperature).toBe(0.2);
  });

  it('passes tool definitions through generateWithTools', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'getTodaySales', arguments: '{"tenantId":"ignored"}' },
            }],
          },
        }],
      }),
    }));

    const provider = createOpenAiCompatibleProvider(runtime);
    const result = await provider.generateWithTools({
      messages: [{ role: 'user', content: 'Sales today?' }],
      tools: [{
        type: 'function',
        function: { name: 'getTodaySales', description: 'Today sales' },
      }],
      toolChoice: 'auto',
    });

    expect(result.toolCalls).toEqual([{
      id: 'call_1',
      type: 'function',
      function: { name: 'getTodaySales', arguments: '{"tenantId":"ignored"}' },
    }]);

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
  });

  it('serializes assistant tool_calls and tool role messages for follow-up rounds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Final answer' } }],
      }),
    }));

    const provider = createOpenAiCompatibleProvider(runtime);
    await provider.generateWithTools({
      messages: [
        { role: 'user', content: 'Sales today?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'getTodaySales', arguments: '{}' },
          }],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: '{"date":"2026-08-27","sales":12500}',
        },
      ],
      tools: [{
        type: 'function',
        function: { name: 'getTodaySales', description: 'Today sales' },
      }],
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.messages).toEqual([
      { role: 'user', content: 'Sales today?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
      {
        role: 'tool',
        content: '{"date":"2026-08-27","sales":12500}',
        tool_call_id: 'call_1',
      },
    ]);
  });

  it('posts to Groq without llama-specific request fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [{
              id: 'call_groq_1',
              type: 'function',
              function: { name: 'getTodaySales', arguments: '{}' },
            }],
          },
        }],
      }),
    }));

    const provider = createOpenAiCompatibleProvider(groqRuntime);
    await provider.generateWithTools({
      messages: [{ role: 'user', content: 'আজকের sales কত?' }],
      tools: [{
        type: 'function',
        function: { name: 'getTodaySales', description: 'Today sales' },
      }],
      toolChoice: 'auto',
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.chat_template_kwargs).toBeUndefined();
    expect(body.max_tokens).toBe(768);
    expect(body.tool_choice).toBe('auto');
  });

  it('omits max_tokens when runtime config does not set maxTokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    }));

    const provider = createOpenAiCompatibleProvider({
      ...groqRuntime,
      maxTokens: undefined,
    });
    await provider.generate({ messages: [{ role: 'user', content: 'Hi' }] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.max_tokens).toBeUndefined();
  });

  it('uses message.reasoning as content fallback when content is empty and no tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: '', reasoning: 'Today sales total is 12,500 BDT.' },
        }],
      }),
    }));

    const provider = createOpenAiCompatibleProvider(groqRuntime);
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Sales today?' }],
    });

    expect(result.content).toBe('Today sales total is 12,500 BDT.');
  });

  it('maps HTTP errors to LlmProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
    }));

    const provider = createOpenAiCompatibleProvider(runtime);
    await expect(provider.generate({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects
      .toBeInstanceOf(LlmProviderError);
  });

  it('maps abort to LlmTimeoutError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      })));

    const provider = createOpenAiCompatibleProvider({
      ...runtime,
      timeoutMs: 10,
    });

    await expect(provider.generate({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects
      .toBeInstanceOf(LlmTimeoutError);
  });
});
