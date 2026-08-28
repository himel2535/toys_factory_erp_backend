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

let cachedRegisteredDefinitions: LlmToolDefinition[] | null = null;
let cachedRegisteredSignature: string | null = null;

function registeredToolsSignature(): string {
  return listTools()
    .map((tool) => tool.name)
    .sort()
    .join('\0');
}

export function invalidateRegisteredToolDefinitionsCacheForTests(): void {
  cachedRegisteredDefinitions = null;
  cachedRegisteredSignature = null;
}

export function registeredToolsToLlmDefinitions(): LlmToolDefinition[] {
  ensureProductionToolsRegistered();
  const signature = registeredToolsSignature();
  if (cachedRegisteredDefinitions && cachedRegisteredSignature === signature) {
    return cachedRegisteredDefinitions;
  }
  cachedRegisteredDefinitions = toolsToLlmDefinitions(listTools());
  cachedRegisteredSignature = signature;
  return cachedRegisteredDefinitions;
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
