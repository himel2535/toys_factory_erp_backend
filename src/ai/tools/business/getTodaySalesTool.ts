import { getTodaySales } from '../../../services/metrics/salesMetrics.js';
import type { ToolDefinition } from '../types.js';

export const getTodaySalesTool: ToolDefinition = {
  name: 'getTodaySales',
  description:
    'Returns today\'s total sales (sales orders + POS) for the authenticated tenant using the Asia/Dhaka business calendar date.',
  requiredSections: ['dashboard'],
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute(context) {
    const { date, total } = await getTodaySales({ tenantId: context.tenantId });
    return {
      date,
      sales: total,
    };
  },
};
