import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLlamaCppProvider } from '../../../src/ai/providers/llamaCppProvider.js';

const runtime = {
  providerId: 'llama_cpp' as const,
  baseUrl: 'http://127.0.0.1:8080/v1',
  apiKey: '',
  model: 'Qwen/Qwen3-1.7B-GGUF',
  timeoutMs: 180_000,
  debug: false,
  supportsTools: true,
  maxTokens: 512,
  chatTemplateKwargs: { enable_thinking: false },
};

describe('llamaCppProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends Qwen3 non-thinking kwargs and max_tokens to llama.cpp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    }));

    const provider = createLlamaCppProvider(runtime);
    await provider.generate({ messages: [{ role: 'user', content: 'Hi' }] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));
    expect(body.max_tokens).toBe(512);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.chat_template_kwargs).not.toHaveProperty('enable_thinking', true);
  });
});
