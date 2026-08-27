export type {
  JsonSchema,
  ToolArgsValidationResult,
  ToolDefinition,
  ToolExecutionResult,
} from './types.js';

export {
  safeToolErrorCode,
  safeToolErrorMessage,
  ToolAuthError,
  ToolDuplicateNameError,
  ToolError,
  ToolNotFoundError,
  ToolValidationError,
} from './errors.js';
export type { ToolErrorCode } from './errors.js';

export { findForbiddenArgKeys, assertNoForbiddenArgKeys } from './forbiddenArgs.js';
export { validateToolArgs } from './schemas.js';
export { userCanExecuteTool } from './authorization.js';

export {
  getTool,
  hasTool,
  listTools,
  registerTool,
  resetToolRegistryForTests,
} from './toolRegistry.js';

export { executeToolCall } from './toolExecutor.js';

export {
  executeLlmToolCalls,
  registeredToolsToLlmDefinitions,
  toolsToLlmDefinitions,
} from './llmToolBridge.js';

export {
  ensureProductionToolsRegistered,
  getDashboardSummaryTool,
  getLowStockCountTool,
  getRevenueTrendTool,
  getSalesTrendTool,
  getTodaySalesTool,
  isProductionToolRegistered,
  PRODUCTION_TOOLS,
} from './business/index.js';
