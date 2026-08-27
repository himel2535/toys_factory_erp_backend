export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'TOOL_AUTH_DENIED'
  | 'TOOL_VALIDATION_FAILED'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_DUPLICATE_NAME';

export class ToolError extends Error {
  readonly code: ToolErrorCode;

  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super('TOOL_NOT_FOUND', `Unknown tool: ${toolName}`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolAuthError extends ToolError {
  constructor(toolName: string) {
    super('TOOL_AUTH_DENIED', `Not authorized to execute tool: ${toolName}`);
    this.name = 'ToolAuthError';
  }
}

export class ToolValidationError extends ToolError {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super('TOOL_VALIDATION_FAILED', message);
    this.name = 'ToolValidationError';
    this.details = details;
  }
}

export class ToolDuplicateNameError extends ToolError {
  constructor(toolName: string) {
    super('TOOL_DUPLICATE_NAME', `Tool already registered: ${toolName}`);
    this.name = 'ToolDuplicateNameError';
  }
}

/** Safe error payload for LLM-facing results — no stack traces or secrets. */
export function safeToolErrorMessage(error: unknown): string {
  if (error instanceof ToolError) return error.message;
  return 'Tool execution failed';
}

export function safeToolErrorCode(error: unknown): ToolErrorCode {
  if (error instanceof ToolError) return error.code;
  return 'TOOL_EXECUTION_FAILED';
}
