import type { EvalCase } from '../harness/types.js';
import { duplicateToolRound, finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const agentLoopCases: EvalCase[] = [
  {
    id: 'agent-two-round-sales',
    category: 'agent-loop',
    description: 'Tool call then final answer in two rounds',
    userMessage: 'What are today sales?',
    providerScript: [
      toolCall('g1', 'getTodaySales'),
      finalAnswer('Today sales are 12,500.'),
    ],
    expect: {
      toolsCalled: ['getTodaySales'],
      finalContains: ['12,500'],
      maxToolCalls: 1,
    },
  },
  {
    id: 'agent-duplicate-skip',
    category: 'agent-loop',
    description: 'Duplicate identical tool calls execute once',
    userMessage: 'Sales today?',
    providerScript: [
      duplicateToolRound('getTodaySales'),
      finalAnswer('Today sales are 12,500.'),
    ],
    expect: {
      toolsCalled: ['getTodaySales', 'getTodaySales'],
      noDuplicateTools: false,
      maxToolCalls: 1,
      finalContains: ['12,500'],
    },
  },
  {
    id: 'agent-trend-then-summary',
    category: 'agent-loop',
    description: 'Two different tools across rounds',
    userMessage: 'Weekly sales and dashboard KPI',
    providerScript: [
      toolCall('g2', 'getSalesTrend', { range: 'week' }),
      toolCall('g3', 'getDashboardSummary', { scope: 'kpi' }),
      finalAnswer('Weekly sales and KPI summary combined.'),
    ],
    expect: {
      toolsCalled: ['getSalesTrend', 'getDashboardSummary'],
      maxToolCalls: 2,
    },
  },
  {
    id: 'agent-empty-content-fallback',
    category: 'agent-loop',
    description: 'Empty provider content uses fallback message',
    userMessage: 'Hello',
    providerScript: [
      finalAnswer('   '),
    ],
    expect: {
      finalContains: ['could not generate'],
    },
  },
];
