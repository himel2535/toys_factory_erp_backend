import type { EvalCase } from '../harness/types.js';
import { finalAnswer, toolCall } from '../fixtures/mockProvider.js';

export const toolArgsCases: EvalCase[] = [
  {
    id: 'args-sales-week-range',
    category: 'tool-args',
    description: 'Correct week range argument',
    userMessage: 'Weekly sales',
    providerScript: [
      toolCall('a1', 'getSalesTrend', { range: 'week' }),
      finalAnswer('Weekly sales ready.'),
    ],
    expect: {
      toolsCalled: ['getSalesTrend'],
      toolArgs: [{ range: 'week' }],
    },
  },
  {
    id: 'args-dashboard-kpi-scope',
    category: 'tool-args',
    description: 'Correct kpi scope argument',
    userMessage: 'Core KPIs only',
    providerScript: [
      toolCall('a2', 'getDashboardSummary', { scope: 'kpi' }),
      finalAnswer('KPI scope applied.'),
    ],
    expect: {
      toolsCalled: ['getDashboardSummary'],
      toolArgs: [{ scope: 'kpi' }],
    },
  },
  {
    id: 'args-forbidden-tenant-id',
    category: 'tool-args',
    description: 'Forbidden tenantId in tool args is rejected',
    userMessage: 'Sales with tenant override',
    providerScript: [
      toolCall('a3', 'getTodaySales', { tenantId: 'evil-tenant' }),
      finalAnswer('Could not fetch due to invalid tool arguments.'),
    ],
    expect: {
      toolsCalled: ['getTodaySales'],
      forbiddenArgKeys: ['tenantId'],
      toolArgs: [{ tenantId: 'evil-tenant' }],
    },
  },
  {
    id: 'args-forbidden-user-id',
    category: 'tool-args',
    description: 'Forbidden userId in tool args is rejected',
    userMessage: 'Sales with user override',
    providerScript: [
      toolCall('a4', 'getTodaySales', { userId: 'evil-user' }),
      finalAnswer('Could not fetch due to invalid tool arguments.'),
    ],
    expect: {
      toolsCalled: ['getTodaySales'],
      forbiddenArgKeys: ['userId'],
    },
  },
];
