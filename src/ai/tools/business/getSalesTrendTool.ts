import { getSalesTrend } from '../../../services/metrics/salesMetrics.js';
import type { ChartTrendRange } from '../../../utils/dashboardChartSeries.js';
import type { ToolDefinition } from '../types.js';
import { chartRangeInputSchema } from './sharedToolSchemas.js';

export const getSalesTrendTool: ToolDefinition<{ range: ChartTrendRange }> = {
  name: 'getSalesTrend',
  description:
    'Sales trend (orders + POS) for the tenant. range: day | week | month | quarter | year.',
  requiredSections: ['dashboard'],
  inputSchema: chartRangeInputSchema,
  async execute(context, args) {
    return getSalesTrend({ tenantId: context.tenantId, range: args.range });
  },
};
