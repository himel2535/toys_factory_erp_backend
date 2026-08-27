import { describe, expect, it } from 'vitest';
import { loadAiConfig } from '../../../src/ai/config/aiConfig.js';
import { LlmConfigError } from '../../../src/ai/errors.js';

describe('loadAiConfig', () => {
  it('returns disabled config when AI_ENABLED is not true', () => {
    expect(loadAiConfig({ AI_ENABLED: 'false' })).toEqual({ enabled: false });
    expect(loadAiConfig({})).toEqual({ enabled: false });
  });

  it('loads openai_compatible config when enabled', () => {
    const config = loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openai_compatible',
      AI_BASE_URL: 'https://example.com/v1',
      AI_API_KEY: 'secret-key',
      AI_MODEL: 'gpt-test',
      AI_TIMEOUT_MS: '45000',
    });

    expect(config).toEqual({
      enabled: true,
      provider: 'openai_compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret-key',
      model: 'gpt-test',
      timeoutMs: 45000,
      allowMissingKey: false,
      debug: false,
    });
  });

  it('applies llama_cpp defaults for base URL and model', () => {
    const config = loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'llama_cpp',
    });

    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error('expected enabled config');
    expect(config.provider).toBe('llama_cpp');
    expect(config.baseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(config.model).toBe('Qwen/Qwen3-1.7B-GGUF');
    expect(config.apiKey).toBe('');
  });

  it('throws for invalid provider', () => {
    expect(() => loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'unknown',
    })).toThrow(LlmConfigError);
  });

  it('throws when openai_compatible is enabled without API key', () => {
    expect(() => loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openai_compatible',
    })).toThrow(/AI_API_KEY is required/);
  });

  it('allows missing API key when AI_ALLOW_MISSING_KEY=true', () => {
    const config = loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openai_compatible',
      AI_ALLOW_MISSING_KEY: 'true',
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error('expected enabled config');
    expect(config.allowMissingKey).toBe(true);
    expect(config.apiKey).toBe('');
  });

  it('throws for invalid timeout', () => {
    expect(() => loadAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'llama_cpp',
      AI_TIMEOUT_MS: '0',
    })).toThrow(/AI_TIMEOUT_MS/);
  });
});
