const DEFAULT_MAX_TOOL_ROUNDS = 3;
const DEFAULT_MAX_MESSAGE_LENGTH = 4000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export type AiChatLimits = {
  maxToolRounds: number;
  maxMessageLength: number;
};

export function loadAiChatLimits(env: NodeJS.ProcessEnv = process.env): AiChatLimits {
  return {
    maxToolRounds: parsePositiveInt(env.AI_MAX_TOOL_ROUNDS, DEFAULT_MAX_TOOL_ROUNDS),
    maxMessageLength: parsePositiveInt(env.AI_MAX_MESSAGE_LENGTH, DEFAULT_MAX_MESSAGE_LENGTH),
  };
}
