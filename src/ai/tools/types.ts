import type { SectionId } from '../../config/sectionAccess.js';
import type { AiExecutionContext } from '../context/types.js';

export type JsonSchema = {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
};

export type ToolDefinition<TArgs = Record<string, unknown>> = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiredSections?: SectionId[];
  requiredPermissions?: string[];
  execute(context: AiExecutionContext, args: TArgs): Promise<unknown> | unknown;
};

export type ToolExecutionResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  durationMs: number;
};

export type ToolArgsValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: string[] };
