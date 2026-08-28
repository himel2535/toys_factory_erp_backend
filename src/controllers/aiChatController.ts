import type { Request, Response } from 'express';
import { loadAiConfig } from '../ai/config/aiConfig.js';
import { buildAiExecutionContext } from '../ai/context/buildAiContext.js';
import { runAiChat } from '../ai/chat/aiChatService.js';
import { mapAiChatError } from '../ai/chat/mapAiChatError.js';
import { validateChatMessage } from '../ai/chat/validateChatMessage.js';
import { checkPromptInjection } from '../ai/chat/promptGuard.js';
import { checkAiRateLimit } from '../ai/chat/aiRateLimiter.js';
import { buildAiRequestMetrics, logAiRequestMetrics } from '../ai/chat/aiRequestMetrics.js';
import type { AuthUser } from '../middleware/authToken.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getRequestTenantId } from '../utils/tenantContext.js';

export const postAiChat = asyncHandler(async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  let promptGuardBlocked = false;
  console.log('[AI_CHAT] request start');
  try {
    const config = loadAiConfig();
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
      promptGuardBlocked = true;
      console.log('[AI_CHAT] prompt_guard blocked', { patternId: guard.patternId });
      logAiRequestMetrics(buildAiRequestMetrics({
        totalMs: Date.now() - requestStartedAt,
        providerMs: 0,
        toolMs: 0,
        toolCallCount: 0,
        toolRounds: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        promptGuardBlocked: true,
      }));
      sendSuccess(res, { message: guard.refusalMessage });
      return;
    }

    const tenantId = getRequestTenantId(req);
    const context = buildAiExecutionContext(user, tenantId);

    const result = await runAiChat({ context, message });
    console.log('[AI_CHAT] final response', {
      elapsedMs: Date.now() - requestStartedAt,
      replyLength: result.message.length,
    });
    logAiRequestMetrics(buildAiRequestMetrics({
      totalMs: Date.now() - requestStartedAt,
      providerMs: result.metrics.providerMs,
      toolMs: result.metrics.toolMs,
      toolCallCount: result.metrics.toolCallCount,
      toolRounds: result.metrics.toolRounds,
      promptTokens: result.metrics.usage.promptTokens,
      completionTokens: result.metrics.usage.completionTokens,
      totalTokens: result.metrics.usage.totalTokens,
      promptGuardBlocked,
    }));
    sendSuccess(res, { message: result.message });
  } catch (error) {
    const errName = error instanceof Error ? error.constructor.name : 'unknown';
    const errMessage = error instanceof Error ? error.message : String(error);
    console.log('[AI_CHAT] error', {
      elapsedMs: Date.now() - requestStartedAt,
      name: errName,
      message: errMessage.slice(0, 200),
    });
    logAiRequestMetrics(buildAiRequestMetrics({
      totalMs: Date.now() - requestStartedAt,
      providerMs: 0,
      toolMs: 0,
      toolCallCount: 0,
      toolRounds: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      promptGuardBlocked,
    }));
    throw mapAiChatError(error);
  }
});
