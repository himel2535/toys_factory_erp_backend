import type { AiProviderId } from '../types.js';
import { LlmConfigError } from '../errors.js';

export type AiConfigDisabled = {
  enabled: false;
};

export type AiConfigEnabled = {
  enabled: true;
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  allowMissingKey: boolean;
  debug: boolean;
};

export type AiConfig = AiConfigDisabled | AiConfigEnabled;

const DEFAULT_LLAMA_BASE_URL = 'http://127.0.0.1:8080/v1';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_LLAMA_MODEL = 'Qwen/Qwen3-1.7B-GGUF';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function parseProvider(value: string | undefined): AiProviderId {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'openai_compatible') return 'openai_compatible';
  if (normalized === 'llama_cpp') return 'llama_cpp';
  throw new LlmConfigError(`Invalid AI_PROVIDER "${value ?? ''}" — expected openai_compatible or llama_cpp`);
}

function defaultBaseUrl(provider: AiProviderId): string {
  return provider === 'llama_cpp' ? DEFAULT_LLAMA_BASE_URL : DEFAULT_OPENAI_BASE_URL;
}

function defaultModel(provider: AiProviderId): string {
  return provider === 'llama_cpp' ? DEFAULT_LLAMA_MODEL : DEFAULT_OPENAI_MODEL;
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new LlmConfigError(`Invalid AI_TIMEOUT_MS "${value}" — must be a positive number`);
  }
  return parsed;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  if (!parseBoolean(env.AI_ENABLED)) {
    return { enabled: false };
  }

  const provider = parseProvider(env.AI_PROVIDER);
  const baseUrl = String(env.AI_BASE_URL ?? defaultBaseUrl(provider)).trim().replace(/\/+$/, '');
  const model = String(env.AI_MODEL ?? defaultModel(provider)).trim();
  const apiKey = String(env.AI_API_KEY ?? '').trim();
  const allowMissingKey = parseBoolean(env.AI_ALLOW_MISSING_KEY);
  const timeoutMs = parseTimeoutMs(env.AI_TIMEOUT_MS);
  const debug = parseBoolean(env.AI_DEBUG);

  if (!baseUrl) {
    throw new LlmConfigError('AI_BASE_URL is required when AI_ENABLED=true');
  }
  if (!model) {
    throw new LlmConfigError('AI_MODEL is required when AI_ENABLED=true');
  }
  if (provider === 'openai_compatible' && !apiKey && !allowMissingKey) {
    throw new LlmConfigError('AI_API_KEY is required for openai_compatible unless AI_ALLOW_MISSING_KEY=true');
  }

  return {
    enabled: true,
    provider,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    allowMissingKey,
    debug,
  };
}

export function assertAiConfigEnabled(config: AiConfig): asserts config is AiConfigEnabled {
  if (!config.enabled) {
    throw new LlmConfigError('AI is not enabled — set AI_ENABLED=true to use the LLM provider');
  }
}
