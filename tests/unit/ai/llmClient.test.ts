import { afterEach, describe, expect, it } from 'vitest';
import { getLlmProvider, resetLlmProviderForTests } from '../../../src/ai/client/llmClient.js';
import { LlmConfigError } from '../../../src/ai/errors.js';

describe('llmClient', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetLlmProviderForTests();
  });

  it('throws when AI is disabled', () => {
    process.env.AI_ENABLED = 'false';
    expect(() => getLlmProvider()).toThrow(LlmConfigError);
  });

  it('returns the same provider instance on repeated calls', () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'llama_cpp';
    resetLlmProviderForTests();

    const first = getLlmProvider();
    const second = getLlmProvider();
    expect(first).toBe(second);
  });

  it('resetLlmProviderForTests clears cached instance', () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'llama_cpp';
    resetLlmProviderForTests();

    const first = getLlmProvider();
    resetLlmProviderForTests();
    const second = getLlmProvider();
    expect(first).not.toBe(second);
  });
});
