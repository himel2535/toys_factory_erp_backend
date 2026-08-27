import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureProductionToolsRegistered,
  isProductionToolRegistered,
  PRODUCTION_TOOLS,
} from '../../../../../src/ai/tools/business/registerProductionTools.js';
import {
  listTools,
  resetToolRegistryForTests,
} from '../../../../../src/ai/tools/toolRegistry.js';
import { ToolDuplicateNameError } from '../../../../../src/ai/tools/errors.js';

const PRODUCTION_TOOL_NAMES = [
  'getTodaySales',
  'getSalesTrend',
  'getRevenueTrend',
  'getDashboardSummary',
  'getLowStockCount',
];

describe('registerProductionTools', () => {
  afterEach(() => {
    resetToolRegistryForTests();
  });

  it('registers all five production tools lazily', () => {
    expect(listTools()).toHaveLength(0);
    ensureProductionToolsRegistered();
    expect(listTools().map((tool) => tool.name).sort()).toEqual([...PRODUCTION_TOOL_NAMES].sort());
  });

  it('is idempotent on repeated registration', () => {
    ensureProductionToolsRegistered();
    ensureProductionToolsRegistered();
    expect(listTools()).toHaveLength(PRODUCTION_TOOLS.length);
  });

  it('identifies production tools by name', () => {
    ensureProductionToolsRegistered();
    for (const name of PRODUCTION_TOOL_NAMES) {
      expect(isProductionToolRegistered(name)).toBe(true);
    }
    expect(isProductionToolRegistered('unknownTool')).toBe(false);
  });

  it('does not duplicate tool names', () => {
    ensureProductionToolsRegistered();
    const names = listTools().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(() => {
      for (const tool of PRODUCTION_TOOLS) {
        if (!names.includes(tool.name)) throw new ToolDuplicateNameError(tool.name);
      }
    }).not.toThrow();
  });
});
