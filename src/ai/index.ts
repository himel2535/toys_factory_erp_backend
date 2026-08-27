export type {
  AiProviderId,
  LlmCallOptions,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmGenerateWithToolsInput,
  LlmGenerateWithToolsResult,
  LlmMessage,
  LlmRole,
  LlmTokenUsage,
  LlmToolCall,
  LlmToolDefinition,
} from './types.js';

export {
  LlmConfigError,
  LlmError,
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from './errors.js';
export type { LlmErrorCode } from './errors.js';

export type { AiExecutionContext } from './context/types.js';
export { buildAiExecutionContext } from './context/buildAiContext.js';

export type { AiConfig, AiConfigDisabled, AiConfigEnabled } from './config/aiConfig.js';
export { assertAiConfigEnabled, loadAiConfig } from './config/aiConfig.js';

export type { LLMProvider } from './providers/types.js';
export { createLlmProvider } from './providers/createProvider.js';

export { getLlmProvider, isAiEnabled, resetLlmProviderForTests } from './client/llmClient.js';

export type { AiChatLimits } from './chat/aiChatLimits.js';
export { loadAiChatLimits } from './chat/aiChatLimits.js';
export { ERP_AI_SYSTEM_PROMPT } from './chat/systemPrompt.js';
export { validateChatMessage } from './chat/validateChatMessage.js';
export { mapAiChatError } from './chat/mapAiChatError.js';
export type { AiChatResult, RunAiChatInput } from './chat/aiChatService.js';
export { runAiChat } from './chat/aiChatService.js';

export type {
  JsonSchema,
  ToolDefinition,
  ToolExecutionResult,
} from './tools/types.js';

export {
  ensureProductionToolsRegistered,
  executeLlmToolCalls,
  executeToolCall,
  getDashboardSummaryTool,
  getLowStockCountTool,
  getRevenueTrendTool,
  getSalesTrendTool,
  getTodaySalesTool,
  getTool,
  hasTool,
  listTools,
  PRODUCTION_TOOLS,
  registerTool,
  resetToolRegistryForTests,
  registeredToolsToLlmDefinitions,
  toolsToLlmDefinitions,
  ToolAuthError,
  ToolDuplicateNameError,
  ToolNotFoundError,
  ToolValidationError,
  userCanExecuteTool,
  validateToolArgs,
} from './tools/index.js';
