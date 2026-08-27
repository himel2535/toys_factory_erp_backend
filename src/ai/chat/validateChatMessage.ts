import { LlmValidationError } from '../errors.js';
import { loadAiChatLimits } from './aiChatLimits.js';

export function validateChatMessage(raw: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (raw === undefined || raw === null) {
    throw new LlmValidationError('Message is required');
  }
  if (typeof raw !== 'string') {
    throw new LlmValidationError('Message must be a string');
  }

  const message = raw.trim();
  if (!message) {
    throw new LlmValidationError('Message cannot be empty');
  }

  const { maxMessageLength } = loadAiChatLimits(env);
  if (message.length > maxMessageLength) {
    throw new LlmValidationError(`Message exceeds maximum length of ${maxMessageLength} characters`);
  }

  return message;
}
