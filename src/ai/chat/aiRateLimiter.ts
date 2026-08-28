import { ApiError } from '../../utils/ApiError.js';
import { loadAiChatLimits } from './aiChatLimits.js';

type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

const WINDOW_MS = 60_000;

function pruneOldTimestamps(entry: WindowEntry, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
}

export function resetAiRateLimiterForTests(): void {
  windows.clear();
}

export function getAiRateLimiterEntryCountForTests(): number {
  return windows.size;
}

export function checkAiRateLimit(userId: string, env: NodeJS.ProcessEnv = process.env): void {
  const { rateLimitEnabled, rateLimitPerMin } = loadAiChatLimits(env);
  if (!rateLimitEnabled) return;

  const key = String(userId ?? '').trim();
  if (!key) return;

  const now = Date.now();
  let entry = windows.get(key);
  if (entry) {
    pruneOldTimestamps(entry, now, WINDOW_MS);
    if (entry.timestamps.length === 0) {
      windows.delete(key);
      entry = undefined;
    }
  }

  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  if (entry.timestamps.length >= rateLimitPerMin) {
    throw new ApiError(429, 'AI rate limit exceeded');
  }

  entry.timestamps.push(now);
}
