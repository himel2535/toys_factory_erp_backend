import { getRevenueTrend } from '../../../services/metrics/salesMetrics.js';
import type { ChartTrendRange } from '../../../utils/dashboardChartSeries.js';
import type { ToolDefinition } from '../types.js';
import { chartRangeInputSchema } from './sharedToolSchemas.js';

export const getRevenueTrendTool: ToolDefinition<{ range: ChartTrendRange }> = {
  name: 'getRevenueTrend',
  description:
    'Revenue trend (invoices + POS) for the tenant. range: day | week | month | quarter | year.',
  requiredSections: ['dashboard'],
  inputSchema: chartRangeInputSchema,
  async execute(context, args) {
    return getRevenueTrend({ tenantId: context.tenantId, range: args.range });
  },
};
