import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ApiError } from '../../../../src/utils/ApiError.js';
import type { AuthUser } from '../../../../src/middleware/authToken.js';
import { resetAiMetricsAggregatorForTests } from '../../../../src/ai/chat/aiMetricsAggregator.js';
import { getAiMetrics } from '../../../../src/controllers/aiMetricsController.js';

vi.mock('../../../../src/ai/client/llmClient.js', () => ({
  isAiEnabled: vi.fn().mockReturnValue(true),
}));

function mockReqRes(user?: AuthUser) {
  const req = {
    user: user ?? {
      _id: 'admin-1',
      role: 'admin',
      allowedSections: ['*'],
    },
  } as unknown as Request;

  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  const next = vi.fn();

  return { req, res, next, json };
}

describe('getAiMetrics', () => {
  afterEach(() => {
    resetAiMetricsAggregatorForTests();
    vi.clearAllMocks();
  });

  it('returns aggregate snapshot for admin users', async () => {
    const { req, res, next, json } = mockReqRes();

    await getAiMetrics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        aiEnabled: true,
        metrics: expect.objectContaining({
          totalRequests: 0,
          successfulRequests: 0,
        }),
      },
    });
  });

  it('rejects non-admin users', async () => {
    const { req, res } = mockReqRes({
      _id: 'user-1',
      role: 'user',
      allowedSections: ['dashboard'],
    });

    const err = await new Promise<unknown>((resolve) => {
      getAiMetrics(req, res, (error) => resolve(error));
    });

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(403);
  });
});
