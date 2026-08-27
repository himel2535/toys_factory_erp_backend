import { getSalesTrend } from '../../../services/metrics/salesMetrics.js';
import type { ChartTrendRange } from '../../../utils/dashboardChartSeries.js';
import type { ToolDefinition } from '../types.js';
import { chartRangeInputSchema } from './sharedToolSchemas.js';

export const getSalesTrendTool: ToolDefinition<{ range: ChartTrendRange }> = {
  name: 'getSalesTrend',
  description:
    'Returns sales trend series (sales orders + POS) for the authenticated tenant over a dashboard-supported range: day, week, month, quarter, or year.',
  requiredSections: ['dashboard'],
  inputSchema: chartRangeInputSchema,
  async execute(context, args) {
    return getSalesTrend({ tenantId: context.tenantId, range: args.range });
  },
};
