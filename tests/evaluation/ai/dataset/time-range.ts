import type { EvalCase } from '../harness/types.js';
import { finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const timeRangeCases: EvalCase[] = [
  {
    id: 'range-sales-week',
    category: 'range',
    description: 'Last 7 days sales trend',
    userMessage: 'Show last 7 days sales trend',
    providerScript: [
      toolCall('r1', 'getSalesTrend', { range: 'week' }),
      finalAnswer('Weekly sales total is 2,000.', { promptTokens: 95, completionTokens: 11, totalTokens: 106 }),
    ],
    expect: {
      toolsCalled: ['getSalesTrend'],
      toolArgs: [{ range: 'week' }],
      finalContains: ['2,000'],
    },
  },
  {
    id: 'range-sales-month',
    category: 'range',
    description: 'Current month sales trend',
    userMessage: 'Current month sales trend',
    providerScript: [
      toolCall('r2', 'getSalesTrend', { range: 'month' }),
      finalAnswer('Monthly sales trend available.', { promptTokens: 95, completionTokens: 8, totalTokens: 103 }),
    ],
    expect: {
      toolsCalled: ['getSalesTrend'],
      toolArgs: [{ range: 'month' }],
    },
  },
  {
    id: 'range-revenue-quarter',
    category: 'range',
    description: 'Quarter revenue trend',
    userMessage: 'Previous quarter revenue trend',
    providerScript: [
      toolCall('r3', 'getRevenueTrend', { range: 'quarter' }),
      finalAnswer('Quarter revenue trend summarized.', { promptTokens: 98, completionTokens: 9, totalTokens: 107 }),
    ],
    expect: {
      toolsCalled: ['getRevenueTrend'],
      toolArgs: [{ range: 'quarter' }],
    },
  },
  {
    id: 'range-sales-day',
    category: 'range',
    description: 'Daily sales trend',
    userMessage: 'Daily sales trend today',
    providerScript: [
      toolCall('r4', 'getSalesTrend', { range: 'day' }),
      finalAnswer('Daily sales trend for today.', { promptTokens: 92, completionTokens: 8, totalTokens: 100 }),
    ],
    expect: {
      toolsCalled: ['getSalesTrend'],
      toolArgs: [{ range: 'day' }],
    },
  },
];
