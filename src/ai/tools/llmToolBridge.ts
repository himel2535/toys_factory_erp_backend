import type { LlmToolCall, LlmToolDefinition } from '../types.js';
import type { AiExecutionContext } from '../context/types.js';
import { ensureProductionToolsRegistered } from './business/registerProductionTools.js';
import { executeToolCall } from './toolExecutor.js';
import { listTools } from './toolRegistry.js';
import type { ToolDefinition, ToolExecutionResult } from './types.js';

export function toolsToLlmDefinitions(tools: ToolDefinition[]): LlmToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function registeredToolsToLlmDefinitions(): LlmToolDefinition[] {
  ensureProductionToolsRegistered();
  return toolsToLlmDefinitions(listTools());
}

export async function executeLlmToolCalls(
  context: AiExecutionContext,
  toolCalls: LlmToolCall[],
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  for (const toolCall of toolCalls) {
    results.push(await executeToolCall(context, toolCall));
  }
  return results;
}
