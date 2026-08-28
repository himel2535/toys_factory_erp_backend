const DEFAULT_MAX_TOOL_ROUNDS = 3;
const DEFAULT_MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_MAX_OUTPUT_TOKENS = 768;
const DEFAULT_LLAMA_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_MAX_TOOL_RESULT_CHARS = 8000;
const DEFAULT_RATE_LIMIT_PER_MIN = 30;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export type AiChatLimits = {
  maxToolRounds: number;
  maxMessageLength: number;
  maxOutputTokens: number;
  llamaMaxOutputTokens: number;
  maxToolResultChars: number;
  rateLimitEnabled: boolean;
  rateLimitPerMin: number;
};

export function loadAiChatLimits(env: NodeJS.ProcessEnv = process.env): AiChatLimits {
  return {
    maxToolRounds: parsePositiveInt(env.AI_MAX_TOOL_ROUNDS, DEFAULT_MAX_TOOL_ROUNDS),
    maxMessageLength: parsePositiveInt(env.AI_MAX_MESSAGE_LENGTH, DEFAULT_MAX_MESSAGE_LENGTH),
    maxOutputTokens: parsePositiveInt(env.AI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
    llamaMaxOutputTokens: parsePositiveInt(env.AI_LLAMA_MAX_OUTPUT_TOKENS, DEFAULT_LLAMA_MAX_OUTPUT_TOKENS),
    maxToolResultChars: parsePositiveInt(env.AI_MAX_TOOL_RESULT_CHARS, DEFAULT_MAX_TOOL_RESULT_CHARS),
    rateLimitEnabled: parseBoolean(env.AI_RATE_LIMIT_ENABLED, true),
    rateLimitPerMin: parsePositiveInt(env.AI_RATE_LIMIT_PER_MIN, DEFAULT_RATE_LIMIT_PER_MIN),
  };
}
