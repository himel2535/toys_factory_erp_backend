import type { LlmMessage } from '../types.js';

export function filterMessagesForProvider(messages: LlmMessage[]): LlmMessage[] {
  return messages.filter((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return true;
    }
    if (message.role === 'tool') {
      return Boolean(message.content?.trim());
    }
    return Boolean(message.content?.trim());
  });
}
