import type { Request, Response } from 'express';
import { loadAiConfig } from '../ai/config/aiConfig.js';
import { buildAiExecutionContext } from '../ai/context/buildAiContext.js';
import { runAiChat } from '../ai/chat/aiChatService.js';
import { mapAiChatError } from '../ai/chat/mapAiChatError.js';
import { validateChatMessage } from '../ai/chat/validateChatMessage.js';
import type { AuthUser } from '../middleware/authToken.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getRequestTenantId } from '../utils/tenantContext.js';

export const postAiChat = asyncHandler(async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
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

    const tenantId = getRequestTenantId(req);
    const context = buildAiExecutionContext(user, tenantId);

    const result = await runAiChat({ context, message });
    console.log('[AI_CHAT] final response', {
      elapsedMs: Date.now() - requestStartedAt,
      replyLength: result.message.length,
    });
    sendSuccess(res, { message: result.message });
  } catch (error) {
    const errName = error instanceof Error ? error.constructor.name : 'unknown';
    const errMessage = error instanceof Error ? error.message : String(error);
    console.log('[AI_CHAT] error', {
      elapsedMs: Date.now() - requestStartedAt,
      name: errName,
      message: errMessage.slice(0, 200),
    });
    throw mapAiChatError(error);
  }
});
