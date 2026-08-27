import { getRevenueTrend } from '../../../services/metrics/salesMetrics.js';
import type { ChartTrendRange } from '../../../utils/dashboardChartSeries.js';
import type { ToolDefinition } from '../types.js';
import { chartRangeInputSchema } from './sharedToolSchemas.js';

export const getRevenueTrendTool: ToolDefinition<{ range: ChartTrendRange }> = {
  name: 'getRevenueTrend',
  description:
    'Returns revenue trend series (invoices + POS) for the authenticated tenant over a dashboard-supported range: day, week, month, quarter, or year.',
  requiredSections: ['dashboard'],
  inputSchema: chartRangeInputSchema,
  async execute(context, args) {
    return getRevenueTrend({ tenantId: context.tenantId, range: args.range });
  },
};
