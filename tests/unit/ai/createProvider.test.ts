import { describe, expect, it } from 'vitest';
import { createLlmProvider } from '../../../src/ai/providers/createProvider.js';

describe('createLlmProvider', () => {
  it('creates openai_compatible provider', () => {
    const provider = createLlmProvider({
      enabled: true,
      provider: 'openai_compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'key',
      model: 'gpt-test',
      timeoutMs: 1000,
      allowMissingKey: false,
      debug: false,
    });
    expect(provider.providerId).toBe('openai_compatible');
  });

  it('creates llama_cpp provider', () => {
    const provider = createLlmProvider({
      enabled: true,
      provider: 'llama_cpp',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKey: '',
      model: 'llama-test',
      timeoutMs: 1000,
      allowMissingKey: true,
      debug: false,
    });
    expect(provider.providerId).toBe('llama_cpp');
  });
});
