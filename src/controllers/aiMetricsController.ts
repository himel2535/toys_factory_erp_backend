import type { Request, Response } from 'express';
import { getAiMetricsSnapshot } from '../ai/chat/aiMetricsAggregator.js';
import { isAiEnabled } from '../ai/client/llmClient.js';
import type { AuthUser } from '../middleware/authToken.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getAiMetrics = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden');
  }

  sendSuccess(res, {
    aiEnabled: isAiEnabled(),
    metrics: getAiMetricsSnapshot(),
  });
});
