import { ApiError } from '../../utils/ApiError.js';
import {
  LlmConfigError,
  LlmError,
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from '../errors.js';

function sanitizeSensitiveText(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .slice(0, 300);
}

function sanitizeProviderMessage(message: string): string {
  return sanitizeSensitiveText(message);
}

function sanitizeConfigMessage(message: string): string {
  return sanitizeSensitiveText(message);
}

export function mapAiChatError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof LlmValidationError) {
    return new ApiError(400, error.message);
  }
  if (error instanceof LlmConfigError) {
    return new ApiError(503, `AI configuration error: ${sanitizeConfigMessage(error.message)}`);
  }
  if (error instanceof LlmTimeoutError) {
    return new ApiError(504, 'AI request timed out');
  }
  if (error instanceof LlmProviderError) {
    return new ApiError(502, sanitizeProviderMessage(error.message));
  }
  if (error instanceof LlmError) {
    return new ApiError(502, 'AI provider error');
  }
  const errName = error instanceof Error ? error.constructor.name : 'unknown';
  const errMessage = error instanceof Error ? error.message : String(error);
  console.log('[AI_CHAT] unmapped error', { name: errName, message: errMessage.slice(0, 200) });
  return new ApiError(500, 'Internal server error');
}
