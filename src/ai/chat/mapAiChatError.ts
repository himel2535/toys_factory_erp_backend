import { ApiError } from '../../utils/ApiError.js';
import {
  LlmConfigError,
  LlmError,
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from '../errors.js';

export function sanitizeServerLogMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .slice(0, 300);
}

export function mapAiChatError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    if (
      error.statusCode === 429
      && (error.message === 'AI rate limit exceeded' || error.message === 'Tool round limit exceeded')
    ) {
      return new ApiError(429, 'AI service is temporarily busy. Please try again shortly.');
    }
    return error;
  }
  if (error instanceof LlmValidationError) {
    return new ApiError(400, error.message);
  }
  if (error instanceof LlmConfigError) {
    console.log('[AI_CHAT] config error', { message: sanitizeServerLogMessage(error.message) });
    return new ApiError(503, 'AI Assistant is currently unavailable.');
  }
  if (error instanceof LlmTimeoutError) {
    return new ApiError(504, 'AI service is taking too long. Please try again.');
  }
  if (error instanceof LlmProviderError) {
    console.log('[AI_CHAT] provider error', {
      status: error.statusCode,
      message: sanitizeServerLogMessage(error.message),
    });
    if (error.statusCode === 429) {
      return new ApiError(429, 'AI service is temporarily busy. Please try again shortly.');
    }
    if (error.statusCode !== undefined && error.statusCode >= 500) {
      return new ApiError(502, 'AI service is temporarily unavailable.');
    }
    return new ApiError(502, 'AI service is temporarily unavailable.');
  }
  if (error instanceof LlmError) {
    return new ApiError(502, 'AI service is temporarily unavailable.');
  }
  const errName = error instanceof Error ? error.constructor.name : 'unknown';
  const errMessage = error instanceof Error ? error.message : String(error);
  console.log('[AI_CHAT] unmapped error', { name: errName, message: sanitizeServerLogMessage(errMessage) });
  return new ApiError(500, 'Internal server error');
}
