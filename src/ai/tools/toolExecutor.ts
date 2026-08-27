import type { LlmToolCall } from '../types.js';
import type { AiExecutionContext } from '../context/types.js';
import { ensureProductionToolsRegistered } from './business/registerProductionTools.js';
import { userCanExecuteTool } from './authorization.js';
import {
  safeToolErrorCode,
  safeToolErrorMessage,
  ToolAuthError,
  ToolNotFoundError,
  ToolValidationError,
} from './errors.js';
import { findForbiddenArgKeys } from './forbiddenArgs.js';
import { validateToolArgs } from './schemas.js';
import { getTool, hasTool } from './toolRegistry.js';
import type { ToolExecutionResult } from './types.js';

function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ToolValidationError('Tool arguments must be valid JSON');
  }
}

function debugLog(message: string): void {
  if (process.env.AI_DEBUG === '1' || process.env.AI_DEBUG === 'true') {
    console.log(message);
  }
}

export async function executeToolCall(
  context: AiExecutionContext,
  toolCall: LlmToolCall,
): Promise<ToolExecutionResult> {
  const started = Date.now();
  const toolCallId = String(toolCall.id ?? '').trim() || 'unknown';
  const toolName = String(toolCall.function?.name ?? '').trim();

  try {
    ensureProductionToolsRegistered();

    if (!toolName) {
      throw new ToolNotFoundError('(empty name)');
    }
    if (!hasTool(toolName)) {
      throw new ToolNotFoundError(toolName);
    }

    const tool = getTool(toolName)!;
    const parsed = parseToolArguments(String(toolCall.function.arguments ?? '{}'));

    const forbidden = findForbiddenArgKeys(parsed);
    if (forbidden.length > 0) {
      throw new ToolValidationError(
        'Tool arguments contain forbidden keys',
        forbidden.map((key) => `${key}: forbidden`),
      );
    }

    const validated = validateToolArgs(tool.inputSchema, parsed);
    if (!validated.ok) {
      throw new ToolValidationError('Tool arguments failed schema validation', validated.errors);
    }

    if (!userCanExecuteTool(context, tool)) {
      throw new ToolAuthError(toolName);
    }

    const data = await tool.execute(context, validated.value);
    const result: ToolExecutionResult = {
      toolCallId,
      toolName,
      ok: true,
      data,
      durationMs: Date.now() - started,
    };
    debugLog(`[ai-tool] name=${toolName} ok=true durationMs=${result.durationMs}`);
    return result;
  } catch (error) {
    const result: ToolExecutionResult = {
      toolCallId,
      toolName: toolName || '(unknown)',
      ok: false,
      error: {
        code: safeToolErrorCode(error),
        message: safeToolErrorMessage(error),
      },
      durationMs: Date.now() - started,
    };
    debugLog(`[ai-tool] name=${result.toolName} ok=false durationMs=${result.durationMs}`);
    return result;
  }
}
