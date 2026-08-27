import type { ToolDefinition } from '../types.js';
import { hasTool, registerTool } from '../toolRegistry.js';
import { getDashboardSummaryTool } from './getDashboardSummaryTool.js';
import { getLowStockCountTool } from './getLowStockCountTool.js';
import { getRevenueTrendTool } from './getRevenueTrendTool.js';
import { getSalesTrendTool } from './getSalesTrendTool.js';
import { getTodaySalesTool } from './getTodaySalesTool.js';

export const PRODUCTION_TOOLS: ToolDefinition[] = [
  getTodaySalesTool,
  getSalesTrendTool,
  getRevenueTrendTool,
  getDashboardSummaryTool,
  getLowStockCountTool,
];

/** Idempotent production tool bootstrap — not called from ERP HTTP path. */
export function ensureProductionToolsRegistered(): void {
  for (const tool of PRODUCTION_TOOLS) {
    if (!hasTool(tool.name)) {
      registerTool(tool);
    }
  }
}

export function isProductionToolRegistered(name: string): boolean {
  return PRODUCTION_TOOLS.some((tool) => tool.name === name) && hasTool(name);
}
