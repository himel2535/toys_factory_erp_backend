import { afterEach, describe, expect, it, vi } from 'vitest';
import { postChatCompletions } from '../../../src/ai/providers/httpChatCompletions.js';
import { LlmProviderError } from '../../../src/ai/errors.js';

const runtime = {
  providerId: 'openai_compatible' as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-test',
  timeoutMs: 1000,
  debug: false,
  supportsTools: true,
  maxTokens: 768,
};

describe('postChatCompletions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws LlmProviderError on non-JSON 200 response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }));

    await expect(postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toBeInstanceOf(LlmProviderError);
  });

  it('throws LlmProviderError when choices are missing on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ usage: {} }),
    }));

    await expect(postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({ statusCode: 502 });
  });

  it('throws LlmProviderError when tool_calls are present but all invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: '' } }],
          },
        }],
      }),
    }));

    await expect(postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({ statusCode: 502 });
  });

  it('uses reasoning fallback when content is empty and there are no tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: '', reasoning: 'Final answer from reasoning.' },
        }],
      }),
    }));

    const result = await postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.content).toBe('Final answer from reasoning.');
    expect(result.toolCalls).toEqual([]);
  });

  it('does not use reasoning when tool_calls are present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: '',
            reasoning: 'Should not be used.',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'getTodaySales', arguments: '{}' },
            }],
          },
        }],
      }),
    }));

    const result = await postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.content).toBe('');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe('getTodaySales');
  });

  it('treats non-string content as empty instead of [object Object]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: { text: 'nested' } },
        }],
      }),
    }));

    const result = await postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.content).toBe('');
    expect(result.content).not.toBe('[object Object]');
  });

  it('uses string reasoning fallback when content is a non-string object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: { bad: true }, reasoning: 'Reasoning answer.' },
        }],
      }),
    }));

    const result = await postChatCompletions(runtime, {
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.content).toBe('Reasoning answer.');
  });
});
