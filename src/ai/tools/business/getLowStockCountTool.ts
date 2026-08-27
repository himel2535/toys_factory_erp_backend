import { getLowStockCount } from '../../../services/metrics/inventoryMetrics.js';
import type { ToolDefinition } from '../types.js';
import { emptyInputSchema } from './sharedToolSchemas.js';

export const getLowStockCountTool: ToolDefinition = {
  name: 'getLowStockCount',
  description:
    'Returns the count of inventory items currently below their low-stock threshold for the authenticated tenant.',
  requiredSections: ['inventory'],
  inputSchema: emptyInputSchema,
  async execute(context) {
    const count = await getLowStockCount({ tenantId: context.tenantId });
    return { count };
  },
};
