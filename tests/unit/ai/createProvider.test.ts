import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLlmProvider } from '../../../src/ai/providers/createProvider.js';

const baseConfig = {
  enabled: true as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'key',
  model: 'gpt-test',
  timeoutMs: 1000,
  allowMissingKey: false,
  debug: false,
};

describe('createLlmProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates openai_compatible provider', () => {
    const provider = createLlmProvider({
      ...baseConfig,
      provider: 'openai_compatible',
    });
    expect(provider.providerId).toBe('openai_compatible');
  });

  it('creates llama_cpp provider', () => {
    const provider = createLlmProvider({
      ...baseConfig,
      provider: 'llama_cpp',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKey: '',
      allowMissingKey: true,
      model: 'llama-test',
    });
    expect(provider.providerId).toBe('llama_cpp');
  });

  it('passes max_tokens from AI_MAX_OUTPUT_TOKENS to openai_compatible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    }));

    const provider = createLlmProvider({
      ...baseConfig,
      provider: 'openai_compatible',
    });
    await provider.generate({ messages: [{ role: 'user', content: 'Hi' }] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.max_tokens).toBe(768);
  });

  it('respects AI_MAX_OUTPUT_TOKENS env override for openai_compatible', async () => {
    vi.stubEnv('AI_MAX_OUTPUT_TOKENS', '1024');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    }));

    const provider = createLlmProvider({
      ...baseConfig,
      provider: 'openai_compatible',
    });
    await provider.generate({ messages: [{ role: 'user', content: 'Hi' }] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.max_tokens).toBe(1024);
  });

  it('passes llama max_tokens and chat_template_kwargs to llama_cpp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    }));

    const provider = createLlmProvider({
      ...baseConfig,
      provider: 'llama_cpp',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKey: '',
      allowMissingKey: true,
      model: 'Qwen/Qwen3-1.7B-GGUF',
    });
    await provider.generate({ messages: [{ role: 'user', content: 'Hi' }] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.max_tokens).toBe(512);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
