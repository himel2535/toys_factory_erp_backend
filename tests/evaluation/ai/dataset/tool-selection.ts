import type { EvalCase } from '../harness/types.js';
import { finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const toolSelectionCases: EvalCase[] = [
  {
    id: 'select-today-sales',
    category: 'tool-selection',
    description: 'Select getTodaySales for sales today intent',
    userMessage: 'Sales today?',
    providerScript: [
      toolCall('s1', 'getTodaySales'),
      finalAnswer('Sales today: 12,500.'),
    ],
    expect: { toolsCalled: ['getTodaySales'] },
  },
  {
    id: 'select-low-stock',
    category: 'tool-selection',
    description: 'Select getLowStockCount for inventory intent',
    userMessage: 'Low stock count?',
    context: { allowedSections: ['dashboard', 'inventory'] },
    providerScript: [
      toolCall('s2', 'getLowStockCount'),
      finalAnswer('Low stock: 14 items.'),
    ],
    expect: { toolsCalled: ['getLowStockCount'] },
  },
  {
    id: 'select-dashboard',
    category: 'tool-selection',
    description: 'Select getDashboardSummary for KPI intent',
    userMessage: 'Dashboard KPI summary',
    providerScript: [
      toolCall('s3', 'getDashboardSummary', { scope: 'kpi' }),
      finalAnswer('KPI summary loaded.'),
    ],
    expect: { toolsCalled: ['getDashboardSummary'] },
  },
  {
    id: 'select-sales-trend-not-revenue',
    category: 'tool-selection',
    description: 'Select getSalesTrend for sales trend intent',
    userMessage: 'Sales trend for the week',
    providerScript: [
      toolCall('s4', 'getSalesTrend', { range: 'week' }),
      finalAnswer('Sales trend for the week.'),
    ],
    expect: { toolsCalled: ['getSalesTrend'] },
  },
];
