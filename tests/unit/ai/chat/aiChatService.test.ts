import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../../src/services/metrics/salesMetrics.js', () => ({
  getTodaySales: vi.fn(),
  getSalesTrend: vi.fn(),
}));

import { getTodaySales, getSalesTrend } from '../../../../src/services/metrics/salesMetrics.js';
import type { LLMProvider } from '../../../../src/ai/providers/types.js';
import type { LlmGenerateWithToolsInput, LlmGenerateWithToolsResult } from '../../../../src/ai/types.js';
import { ApiError } from '../../../../src/utils/ApiError.js';
import { LlmProviderError, LlmTimeoutError, LlmValidationError, LlmConfigError } from '../../../../src/ai/errors.js';
import { baseContext } from '../tools/fixtures/mockTools.js';
import { resetToolRegistryForTests } from '../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../src/ai/tools/business/registerProductionTools.js';
import {
  invalidateRegisteredToolDefinitionsCacheForTests,
  registeredToolsToLlmDefinitions,
} from '../../../../src/ai/tools/llmToolBridge.js';
import { validateChatMessage } from '../../../../src/ai/chat/validateChatMessage.js';
import { mapAiChatError } from '../../../../src/ai/chat/mapAiChatError.js';
import { loadAiChatLimits } from '../../../../src/ai/chat/aiChatLimits.js';
import { createAiRequestMetricsTracker } from '../../../../src/ai/chat/aiRequestMetrics.js';
import { runAiChat } from '../../../../src/ai/chat/aiChatService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatDir = join(__dirname, '../../../../src/ai/chat');

function createMockProvider(
  responses: LlmGenerateWithToolsResult[],
): LLMProvider & { calls: LlmGenerateWithToolsInput[] } {
  const calls: LlmGenerateWithToolsInput[] = [];
  let index = 0;
  return {
    providerId: 'openai_compatible',
    async generate() {
      throw new Error('not used');
    },
    async generateWithTools(input) {
      calls.push(input);
      const response = responses[index];
      index += 1;
      if (!response) {
        throw new Error('unexpected LLM call');
      }
      return response;
    },
    calls,
  };
}

describe('validateChatMessage', () => {
  it('rejects missing, empty, and non-string messages', () => {
    expect(() => validateChatMessage(undefined)).toThrow(LlmValidationError);
    expect(() => validateChatMessage('')).toThrow(LlmValidationError);
    expect(() => validateChatMessage('   ')).toThrow(LlmValidationError);
    expect(() => validateChatMessage(123)).toThrow(LlmValidationError);
  });

  it('rejects oversized messages', () => {
    const env = { AI_MAX_MESSAGE_LENGTH: '10' };
    expect(() => validateChatMessage('12345678901', env)).toThrow(LlmValidationError);
    expect(validateChatMessage('hello', env)).toBe('hello');
  });
});

describe('loadAiChatLimits', () => {
  it('defaults max tool rounds to 3 and message length to 4000', () => {
    expect(loadAiChatLimits({})).toEqual({
      maxToolRounds: 3,
      maxMessageLength: 4000,
      maxOutputTokens: 768,
      llamaMaxOutputTokens: 512,
      maxToolResultChars: 8000,
      rateLimitEnabled: true,
      rateLimitPerMin: 30,
    });
  });

  it('parses env overrides', () => {
    expect(loadAiChatLimits({
      AI_MAX_TOOL_ROUNDS: '5',
      AI_MAX_MESSAGE_LENGTH: '8000',
      AI_MAX_OUTPUT_TOKENS: '1024',
      AI_MAX_TOOL_RESULT_CHARS: '4000',
      AI_RATE_LIMIT_PER_MIN: '10',
      AI_RATE_LIMIT_ENABLED: 'false',
    })).toEqual({
      maxToolRounds: 5,
      maxMessageLength: 8000,
      maxOutputTokens: 1024,
      llamaMaxOutputTokens: 512,
      maxToolResultChars: 4000,
      rateLimitEnabled: false,
      rateLimitPerMin: 10,
    });
  });
});

describe('mapAiChatError', () => {
  it('maps validation, config, timeout, and provider errors safely', () => {
    expect(mapAiChatError(new LlmValidationError('bad')).statusCode).toBe(400);
    expect(mapAiChatError(new LlmTimeoutError()).statusCode).toBe(504);
    expect(mapAiChatError(new LlmTimeoutError()).message).toBe('AI service is taking too long. Please try again.');
    const providerErr = mapAiChatError(new LlmProviderError('Bearer sk-secret123 failed', 502));
    expect(providerErr.statusCode).toBe(502);
    expect(providerErr.message).toBe('AI service is temporarily unavailable.');
    expect(providerErr.message).not.toContain('sk-secret123');
    expect(mapAiChatError(new ApiError(429, 'Tool round limit exceeded')).statusCode).toBe(429);
    expect(mapAiChatError(new ApiError(429, 'AI rate limit exceeded')).message)
      .toBe('AI service is temporarily busy. Please try again shortly.');
  });

  it('maps LlmConfigError to a generic unavailable message', () => {
    const err = mapAiChatError(
      new LlmConfigError('AI_API_KEY is required for openai_compatible unless AI_ALLOW_MISSING_KEY=true'),
    );
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('AI Assistant is currently unavailable.');
    expect(err.message).not.toContain('sk-');
  });

  it('maps provider 429 to busy message', () => {
    const err = mapAiChatError(new LlmProviderError('rate limit', 429));
    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('AI service is temporarily busy. Please try again shortly.');
  });
});

describe('runAiChat', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    invalidateRegisteredToolDefinitionsCacheForTests();
    vi.clearAllMocks();
  });

  it('returns direct LLM answer when no tool calls', async () => {
    const provider = createMockProvider([{
      content: 'Hello from ERP assistant',
      toolCalls: [],
    }]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Hi',
      provider,
    });

    expect(result.message).toBe('Hello from ERP assistant');
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.tools?.length).toBeGreaterThan(0);
    expect(provider.calls[0]?.tools?.length).toBe(5);
  });

  it('passes registered tool definitions to the LLM', async () => {
    ensureProductionToolsRegistered();
    const provider = createMockProvider([{
      content: 'Done',
      toolCalls: [],
    }]);

    await runAiChat({ context: baseContext, message: 'Hi', provider });

    const toolNames = provider.calls[0]?.tools?.map((t) => t.function.name) ?? [];
    const registered = registeredToolsToLlmDefinitions().map((t) => t.function.name);
    expect(toolNames).toEqual(registered);
    expect(toolNames).toContain('getTodaySales');
  });

  it('records provider and tool metrics in the optional tracker', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 12500 });
    ensureProductionToolsRegistered();
    const tracker = createAiRequestMetricsTracker({ requestId: 'track-1' });

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{"tenantId":"evil"}' },
        }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
      {
        content: 'Done',
        toolCalls: [],
      },
    ]);

    await runAiChat({
      context: baseContext,
      message: 'Sales today?',
      provider,
      metricsTracker: tracker,
      requestId: 'track-1',
    });

    expect(tracker.providerCallCount).toBe(2);
    expect(tracker.toolCallCount).toBe(1);
    expect(tracker.toolRounds).toBe(1);
    expect(tracker.toolValidationFailures).toBe(1);
    expect(tracker.usage.totalTokens).toBe(15);
    expect(tracker.toolObservations[0]?.toolName).toBe('getTodaySales');
  });

  it('executes getTodaySales through executeToolCall and returns final answer', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 12500 });
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
      {
        content: 'Today sales are 12,500.',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'What are today sales?',
      provider,
    });

    expect(result.message).toBe('Today sales are 12,500.');
    expect(getTodaySales).toHaveBeenCalledWith({ tenantId: 'tenantA' });
    expect(provider.calls).toHaveLength(2);

    const secondCallMessages = provider.calls[1]?.messages ?? [];
    const assistantMsg = secondCallMessages.find((m) => m.role === 'assistant');
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
    expect(assistantMsg?.toolCalls).toHaveLength(1);
    expect(toolMsg?.toolCallId).toBe('call_1');
    expect(JSON.parse(toolMsg?.content ?? '{}')).toEqual({
      date: '2026-08-27',
      sales: 12500,
    });
  });

  it('executes getSalesTrend through executeToolCall and returns final answer', async () => {
    const series = [
      { key: '2026-08-21', date: '2026-08-21', label: 'Aug 21', value: 800 },
      { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 1200 },
    ];
    vi.mocked(getSalesTrend).mockResolvedValue(series);
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_trend',
          type: 'function',
          function: { name: 'getSalesTrend', arguments: '{"range":"week"}' },
        }],
      },
      {
        content: 'This week sales trend shows 1,200 on the latest day.',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Show this week sales trend',
      provider,
    });

    expect(result.message).toBe('This week sales trend shows 1,200 on the latest day.');
    expect(getSalesTrend).toHaveBeenCalledWith({ tenantId: 'tenantA', range: 'week' });
    const toolMsg = provider.calls[1]?.messages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolMsg?.content ?? '[]')).toEqual({
      range: 'week',
      total: 2000,
      peak: { label: 'Aug 27', value: 1200 },
      points: [
        { label: 'Aug 21', value: 800 },
        { label: 'Aug 27', value: 1200 },
      ],
    });
  });

  it('executes distinct tools in parallel within the same round', async () => {
    vi.mocked(getTodaySales).mockImplementation(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      return { date: '2026-08-27', total: 12500 };
    });
    vi.mocked(getSalesTrend).mockImplementation(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      return [
        { key: '2026-08-27', date: '2026-08-27', label: 'Aug 27', value: 1200 },
      ];
    });
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [
          {
            id: 'call_sales',
            type: 'function',
            function: { name: 'getTodaySales', arguments: '{}' },
          },
          {
            id: 'call_trend',
            type: 'function',
            function: { name: 'getSalesTrend', arguments: '{"range":"week"}' },
          },
        ],
      },
      {
        content: 'Sales and trend combined.',
        toolCalls: [],
      },
    ]);

    const started = Date.now();
    const result = await runAiChat({
      context: baseContext,
      message: 'Sales today and weekly trend',
      provider,
    });
    const elapsedMs = Date.now() - started;

    expect(result.message).toBe('Sales and trend combined.');
    expect(getTodaySales).toHaveBeenCalledTimes(1);
    expect(getSalesTrend).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(80);

    const toolMessages = provider.calls[1]?.messages.filter((m) => m.role === 'tool') ?? [];
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]?.toolCallId).toBe('call_sales');
    expect(toolMessages[1]?.toolCallId).toBe('call_trend');
  });

  it('skips duplicate tool calls within the same request', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 100 });
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [
          {
            id: 'call_a',
            type: 'function',
            function: { name: 'getTodaySales', arguments: '{}' },
          },
          {
            id: 'call_b',
            type: 'function',
            function: { name: 'getTodaySales', arguments: '{}' },
          },
        ],
      },
      {
        content: 'Combined answer',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Sales?',
      provider,
    });

    expect(result.message).toBe('Combined answer');
    expect(getTodaySales).toHaveBeenCalledTimes(1);
    const toolMessages = provider.calls[1]?.messages.filter((m) => m.role === 'tool') ?? [];
    expect(toolMessages).toHaveLength(2);
  });

  it('aggregates provider usage metadata across rounds', async () => {
    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [],
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Hi',
      provider,
    });

    expect(result.metrics.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
    });
  });

  it('throws when tool round limit is exceeded', async () => {
    vi.mocked(getTodaySales).mockResolvedValue({ date: '2026-08-27', total: 100 });
    ensureProductionToolsRegistered();
    const env = { AI_MAX_TOOL_ROUNDS: '1' };

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
      {
        content: '',
        toolCalls: [{
          id: 'call_2',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
    ]);

    await expect(runAiChat({
      context: baseContext,
      message: 'Sales?',
      provider,
      env,
    })).rejects.toMatchObject({ statusCode: 429, message: 'Tool round limit exceeded' });
  });

  it('feeds safe tool errors back to the LLM for unknown tools', async () => {
    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_x',
          type: 'function',
          function: { name: 'unknownTool', arguments: '{}' },
        }],
      },
      {
        content: 'I could not fetch that data.',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Unknown?',
      provider,
    });

    expect(result.message).toBe('I could not fetch that data.');
    const toolMsg = provider.calls[1]?.messages.find((m) => m.role === 'tool');
    const payload = JSON.parse(toolMsg?.content ?? '{}');
    expect(payload.error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('feeds malformed tool argument errors back to the LLM', async () => {
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_bad',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{bad json' },
        }],
      },
      {
        content: 'Invalid request.',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: baseContext,
      message: 'Sales?',
      provider,
    });

    expect(result.message).toBe('Invalid request.');
    const toolMsg = provider.calls[1]?.messages.find((m) => m.role === 'tool');
    const payload = JSON.parse(toolMsg?.content ?? '{}');
    expect(payload.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('feeds RBAC tool authorization failures back to the LLM', async () => {
    ensureProductionToolsRegistered();

    const provider = createMockProvider([
      {
        content: '',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
      {
        content: 'You do not have access.',
        toolCalls: [],
      },
    ]);

    const result = await runAiChat({
      context: { ...baseContext, allowedSections: ['payroll'] },
      message: 'Sales?',
      provider,
    });

    expect(result.message).toBe('You do not have access.');
    const toolMsg = provider.calls[1]?.messages.find((m) => m.role === 'tool');
    const payload = JSON.parse(toolMsg?.content ?? '{}');
    expect(payload.error?.code).toBe('TOOL_AUTH_DENIED');
  });

  it('propagates provider timeout errors', async () => {
    const provider: LLMProvider = {
      providerId: 'openai_compatible',
      async generate() {
        throw new Error('unused');
      },
      async generateWithTools() {
        throw new LlmTimeoutError();
      },
    };

    await expect(runAiChat({
      context: baseContext,
      message: 'Hi',
      provider,
    })).rejects.toBeInstanceOf(LlmTimeoutError);
  });
});

describe('ai chat layer security static checks', () => {
  it('does not import mongoose, ERP HTTP, or read tenantId from client fields', () => {
    const files = readdirSync(chatDir).filter((f) => f.endsWith('.ts'));
    const forbidden = [
      'mongoose',
      "fetch('/api/v1",
      'axios',
      'req.body.tenantId',
      'req.query.tenantId',
      'eval(',
      'new Function',
    ];

    for (const file of files) {
      const source = readFileSync(join(chatDir, file), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toContain(pattern);
      }
    }
  });

  it('controller source does not expose API keys or read tenant from body', () => {
    const source = readFileSync(
      join(__dirname, '../../../../src/controllers/aiChatController.ts'),
      'utf8',
    );
    expect(source).not.toContain('req.body.tenantId');
    expect(source).not.toContain('req.query.tenantId');
    expect(source).not.toContain('mongoose');
    expect(source).toContain('getRequestTenantId(req)');
  });
});
