import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ApiError } from '../../../../src/utils/ApiError.js';
import { LlmProviderError } from '../../../../src/ai/errors.js';
import type { AuthUser } from '../../../../src/middleware/authToken.js';

vi.mock('../../../../src/ai/chat/aiChatService.js', () => ({
  runAiChat: vi.fn(),
}));

vi.mock('../../../../src/ai/config/aiConfig.js', () => ({
  loadAiConfig: vi.fn(),
}));

import { loadAiConfig } from '../../../../src/ai/config/aiConfig.js';
import { runAiChat } from '../../../../src/ai/chat/aiChatService.js';
import { postAiChat } from '../../../../src/controllers/aiChatController.js';

function mockReqRes(body: unknown, user?: AuthUser, tenantId = 'tenantA') {
  const req = {
    body,
    user: user ?? {
      _id: 'user-1',
      role: 'user',
      allowedSections: ['dashboard'],
    },
    tenantId,
  } as unknown as Request;

  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  const next = vi.fn();

  return { req, res, next, json, status, nextFn: next };
}

describe('postAiChat', () => {
  afterEach(() => {
    vi.mocked(runAiChat).mockClear();
    vi.mocked(loadAiConfig).mockClear();
  });

  it('rejects when AI is disabled before calling the provider', async () => {
    vi.mocked(loadAiConfig).mockReturnValue({ enabled: false });
    const { req, res, next } = mockReqRes({ message: 'Hello' });

    await postAiChat(req, res, next);

    expect(runAiChat).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect((next.mock.calls[0]?.[0] as ApiError).statusCode).toBe(503);
  });

  it('allows authorized chat when AI is enabled', async () => {
    vi.mocked(loadAiConfig).mockReturnValue({
      enabled: true,
      provider: 'openai_compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key-should-not-leak',
      model: 'gpt-test',
      timeoutMs: 1000,
      allowMissingKey: false,
      debug: false,
    });
    vi.mocked(runAiChat).mockResolvedValue({ message: 'Today sales are 12,500.' });

    const { req, res, next, json } = mockReqRes({ message: 'Sales today?' });

    await postAiChat(req, res, next);

    expect(runAiChat).toHaveBeenCalledOnce();
    expect(runAiChat.mock.calls[0]?.[0].context.tenantId).toBe('tenantA');
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Today sales are 12,500.' },
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-key-should-not-leak');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty messages', async () => {
    vi.mocked(loadAiConfig).mockReturnValue({ enabled: true } as ReturnType<typeof loadAiConfig>);
    const { req, res, next } = mockReqRes({ message: '   ' });

    await postAiChat(req, res, next);

    expect(runAiChat).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect((next.mock.calls[0]?.[0] as ApiError).statusCode).toBe(400);
  });

  it('maps provider errors without leaking secrets', async () => {
    vi.mocked(loadAiConfig).mockReturnValue({
      enabled: true,
      provider: 'openai_compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-live-secret',
      model: 'gpt-test',
      timeoutMs: 1000,
      allowMissingKey: false,
      debug: false,
    });
    vi.mocked(runAiChat).mockImplementation(() =>
      Promise.reject(new LlmProviderError('Bearer sk-live-secret failed', 502)),
    );

    const { req, res } = mockReqRes({ message: 'Hi' });

    const err = await new Promise<unknown>((resolve) => {
      postAiChat(req, res, (error) => resolve(error));
    });

    expect(runAiChat).toHaveBeenCalledOnce();
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(502);
    expect(JSON.stringify(err)).not.toContain('sk-live-secret');
  });
});
