import type { EvalCase } from '../harness/types.js';
import { finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const simpleFactualCases: EvalCase[] = [
  {
    id: 'simple-today-sales',
    category: 'simple',
    description: 'Today sales factual query',
    userMessage: 'What are today sales?',
    providerScript: [
      toolCall('c1', 'getTodaySales'),
      finalAnswer('Today sales are 12,500.', { promptTokens: 100, completionTokens: 12, totalTokens: 112 }),
    ],
    expect: {
      toolsCalled: ['getTodaySales'],
      noDuplicateTools: true,
      finalContains: ['12,500'],
      maxTotalTokens: 500,
    },
  },
  {
    id: 'simple-low-stock',
    category: 'simple',
    description: 'Low stock count query',
    userMessage: 'How many low stock items?',
    context: { allowedSections: ['dashboard', 'inventory'] },
    providerScript: [
      toolCall('c2', 'getLowStockCount'),
      finalAnswer('There are 14 low stock items.', { promptTokens: 90, completionTokens: 10, totalTokens: 100 }),
    ],
    expect: {
      toolsCalled: ['getLowStockCount'],
      finalContains: ['14'],
    },
  },
  {
    id: 'simple-dashboard-summary',
    category: 'simple',
    description: 'Dashboard summary query',
    userMessage: 'Give dashboard summary',
    providerScript: [
      toolCall('c3', 'getDashboardSummary', { scope: 'kpi' }),
      finalAnswer('Month revenue is 240,000.', { promptTokens: 110, completionTokens: 14, totalTokens: 124 }),
    ],
    expect: {
      toolsCalled: ['getDashboardSummary'],
      toolArgs: [{ scope: 'kpi' }],
      finalContains: ['240'],
    },
  },
  {
    id: 'simple-revenue-trend',
    category: 'simple',
    description: 'Revenue trend month query',
    userMessage: 'Show revenue trend this month',
    providerScript: [
      toolCall('c4', 'getRevenueTrend', { range: 'month' }),
      finalAnswer('Revenue trend peak is Aug 27 at 1,200.', { promptTokens: 105, completionTokens: 16, totalTokens: 121 }),
    ],
    expect: {
      toolsCalled: ['getRevenueTrend'],
      toolArgs: [{ range: 'month' }],
      finalContains: ['1,200'],
    },
  },
];
