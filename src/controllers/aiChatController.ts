import type { Request, Response } from 'express';
import { loadAiConfig } from '../ai/config/aiConfig.js';
import { buildAiExecutionContext } from '../ai/context/buildAiContext.js';
import { runAiChat } from '../ai/chat/aiChatService.js';
import { mapAiChatError } from '../ai/chat/mapAiChatError.js';
import { validateChatMessage } from '../ai/chat/validateChatMessage.js';
import { checkPromptInjection } from '../ai/chat/promptGuard.js';
import { checkAiRateLimit } from '../ai/chat/aiRateLimiter.js';
import {
  createAiRequestId,
  createAiRequestMetricsTracker,
  finalizeAiRequestMetrics,
  logAiRequestMetrics,
  resolveAiRequestStatus,
  type AiRequestMetricsTracker,
  type AiRequestStatus,
} from '../ai/chat/aiRequestMetrics.js';
import { recordAiRequestMetrics } from '../ai/chat/aiMetricsAggregator.js';
import type { AuthUser } from '../middleware/authToken.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getRequestTenantId } from '../utils/tenantContext.js';

function metricsConfig(config: ReturnType<typeof loadAiConfig>): { provider: string; model: string } {
  if (!config.enabled) {
    return { provider: 'disabled', model: 'disabled' };
  }
  return { provider: config.provider, model: config.model };
}

function emitRequestMetrics(
  tracker: AiRequestMetricsTracker,
  startedAt: number,
  config: { provider: string; model: string },
  status: AiRequestStatus,
  error?: unknown,
): void {
  const metrics = finalizeAiRequestMetrics({
    tracker,
    startedAt,
    config,
    status,
    error,
  });
  logAiRequestMetrics(metrics);
  recordAiRequestMetrics(metrics);
}

export const postAiChat = asyncHandler(async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const requestId = createAiRequestId();
  const tracker = createAiRequestMetricsTracker({ requestId });
  let configSnapshot = metricsConfig(loadAiConfig());
  let finalStatus: AiRequestStatus = 'error';
  let caughtError: unknown;

  console.log('[AI_CHAT] request start', { requestId });

  try {
    const config = loadAiConfig();
    configSnapshot = metricsConfig(config);
    if (!config.enabled) {
      throw new ApiError(503, 'AI is not enabled');
    }

    const message = validateChatMessage((req.body as { message?: unknown })?.message);

    const user = (req as Request & { user?: AuthUser }).user;
    if (!user) {
      throw new ApiError(401, 'Unauthorized');
    }

    checkAiRateLimit(String(user._id ?? ''));

    const guard = checkPromptInjection(message);
    if (guard.blocked) {
      tracker.promptGuardBlocked = true;
      finalStatus = 'blocked';
      console.log('[AI_CHAT] prompt_guard blocked', { requestId, patternId: guard.patternId });
      sendSuccess(res, { message: guard.refusalMessage });
      return;
    }

    const tenantId = getRequestTenantId(req);
    const context = buildAiExecutionContext(user, tenantId);

    const result = await runAiChat({
      context,
      message,
      metricsTracker: tracker,
      requestId,
    });
    finalStatus = 'success';
    console.log('[AI_CHAT] final response', {
      requestId,
      elapsedMs: Date.now() - requestStartedAt,
      replyLength: result.message.length,
    });
    sendSuccess(res, { message: result.message });
  } catch (error) {
    caughtError = error;
    finalStatus = resolveAiRequestStatus(error);
    const errName = error instanceof Error ? error.constructor.name : 'unknown';
    const errMessage = error instanceof Error ? error.message : String(error);
    console.log('[AI_CHAT] error', {
      requestId,
      elapsedMs: Date.now() - requestStartedAt,
      name: errName,
      message: errMessage.slice(0, 200),
    });
    throw mapAiChatError(error);
  } finally {
    emitRequestMetrics(tracker, requestStartedAt, configSnapshot, finalStatus, caughtError);
  }
});
