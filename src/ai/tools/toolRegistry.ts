import { ToolDuplicateNameError } from './errors.js';
import type { ToolDefinition } from './types.js';

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  const name = String(tool.name ?? '').trim();
  if (!name) {
    throw new ToolDuplicateNameError('(empty name)');
  }
  if (tools.has(name)) {
    throw new ToolDuplicateNameError(name);
  }
  tools.set(name, { ...tool, name });
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function hasTool(name: string): boolean {
  return tools.has(name);
}

export function listTools(): ToolDefinition[] {
  return [...tools.values()];
}

export function resetToolRegistryForTests(): void {
  tools.clear();
}
