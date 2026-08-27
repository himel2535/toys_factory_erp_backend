export type LlmErrorCode =
  | 'CONFIG_ERROR'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'TOOLS_NOT_SUPPORTED'
  | 'VALIDATION_ERROR';

export class LlmError extends Error {
  readonly code: LlmErrorCode;

  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

export class LlmConfigError extends LlmError {
  constructor(message: string) {
    super('CONFIG_ERROR', message);
    this.name = 'LlmConfigError';
  }
}

export class LlmProviderError extends LlmError {
  readonly statusCode?: number;
  readonly providerBody?: unknown;

  constructor(message: string, statusCode?: number, providerBody?: unknown) {
    super('PROVIDER_ERROR', message);
    this.name = 'LlmProviderError';
    this.statusCode = statusCode;
    this.providerBody = providerBody;
  }
}

export class LlmTimeoutError extends LlmError {
  constructor(message = 'LLM request timed out') {
    super('TIMEOUT', message);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmValidationError extends LlmError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'LlmValidationError';
  }
}
