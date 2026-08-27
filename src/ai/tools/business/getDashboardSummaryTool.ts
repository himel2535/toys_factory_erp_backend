import { getDashboardSummaryMetrics } from '../../../services/metrics/dashboardMetrics.js';
import type { SummaryScope } from '../../../services/metrics/types.js';
import type { ToolDefinition } from '../types.js';
import { summaryScopeInputSchema } from './sharedToolSchemas.js';

export const getDashboardSummaryTool: ToolDefinition<{ scope?: SummaryScope }> = {
  name: 'getDashboardSummary',
  description:
    'Returns dashboard KPI/summary aggregates for the authenticated tenant. Optional scope: kpi (core KPIs), extra (extended metrics), or full (default).',
  requiredSections: ['dashboard'],
  inputSchema: summaryScopeInputSchema,
  async execute(context, args) {
    const scope: SummaryScope = args.scope ?? 'full';
    const { payload } = await getDashboardSummaryMetrics({
      tenantId: context.tenantId,
      scope,
    });
    return payload;
  },
};
