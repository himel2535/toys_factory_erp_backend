import type { EvalCase } from '../harness/types.js';
import { finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const errorCases: EvalCase[] = [
  {
    id: 'err-provider-timeout',
    category: 'error',
    description: 'Provider timeout maps to 504',
    userMessage: 'Sales today?',
    providerScript: [toolCall('e1', 'getTodaySales')],
    expect: { errorType: 'timeout' },
  },
  {
    id: 'err-provider-429',
    category: 'error',
    description: 'Provider 429 maps to busy message',
    userMessage: 'Sales today?',
    providerScript: [toolCall('e2', 'getTodaySales')],
    expect: { errorType: '429' },
  },
  {
    id: 'err-provider-502',
    category: 'error',
    description: 'Provider 5xx maps to unavailable message',
    userMessage: 'Sales today?',
    providerScript: [toolCall('e3', 'getTodaySales')],
    expect: { errorType: '502' },
  },
  {
    id: 'err-tool-round-limit',
    category: 'error',
    description: 'Tool round limit exceeded returns 429',
    userMessage: 'Keep calling tools',
    providerScript: [
      toolCall('e4a', 'getTodaySales'),
      toolCall('e4b', 'getTodaySales'),
      toolCall('e4c', 'getTodaySales'),
      toolCall('e4d', 'getTodaySales'),
    ],
    expect: {
      apiErrorStatus: 429,
    },
  },
];
