import { describe, expect, it, vi, afterEach } from 'vitest';
import { checkAiRateLimit, resetAiRateLimiterForTests } from '../../../../src/ai/chat/aiRateLimiter.js';
import { ApiError } from '../../../../src/utils/ApiError.js';

describe('checkAiRateLimit', () => {
  afterEach(() => {
    resetAiRateLimiterForTests();
    vi.useRealTimers();
  });

  it('allows requests under the per-minute limit', () => {
    const env = { AI_RATE_LIMIT_ENABLED: 'true', AI_RATE_LIMIT_PER_MIN: '3' };
    expect(() => checkAiRateLimit('user-1', env)).not.toThrow();
    expect(() => checkAiRateLimit('user-1', env)).not.toThrow();
    expect(() => checkAiRateLimit('user-1', env)).not.toThrow();
  });

  it('rejects when per-user limit is exceeded', () => {
    const env = { AI_RATE_LIMIT_ENABLED: 'true', AI_RATE_LIMIT_PER_MIN: '2' };
    checkAiRateLimit('user-2', env);
    checkAiRateLimit('user-2', env);
    expect(() => checkAiRateLimit('user-2', env)).toThrow(ApiError);
    try {
      checkAiRateLimit('user-2', env);
    } catch (error) {
      expect((error as ApiError).statusCode).toBe(429);
      expect((error as ApiError).message).toBe('AI rate limit exceeded');
    }
  });

  it('tracks limits separately per user', () => {
    const env = { AI_RATE_LIMIT_ENABLED: 'true', AI_RATE_LIMIT_PER_MIN: '1' };
    checkAiRateLimit('user-a', env);
    expect(() => checkAiRateLimit('user-b', env)).not.toThrow();
  });

  it('can be disabled via env', () => {
    const env = { AI_RATE_LIMIT_ENABLED: 'false', AI_RATE_LIMIT_PER_MIN: '1' };
    checkAiRateLimit('user-c', env);
    expect(() => checkAiRateLimit('user-c', env)).not.toThrow();
  });
});
