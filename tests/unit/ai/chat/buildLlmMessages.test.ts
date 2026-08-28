import { describe, expect, it } from 'vitest';
import { filterMessagesForProvider } from '../../../../src/ai/chat/buildLlmMessages.js';
import type { LlmMessage } from '../../../../src/ai/types.js';

describe('filterMessagesForProvider', () => {
  it('removes empty user and assistant messages without tool calls', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: '' },
    ];
    expect(filterMessagesForProvider(messages)).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('keeps assistant messages that include tool calls even when content is empty', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'Sales?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'getTodaySales', arguments: '{}' },
        }],
      },
      { role: 'tool', toolCallId: 'call_1', content: '{"sales":100}' },
    ];
    expect(filterMessagesForProvider(messages)).toHaveLength(3);
  });
});
