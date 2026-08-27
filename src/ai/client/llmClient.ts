import { assertAiConfigEnabled, loadAiConfig } from '../config/aiConfig.js';
import type { LLMProvider } from '../providers/types.js';
import { createLlmProvider } from '../providers/createProvider.js';

let cachedProvider: LLMProvider | null = null;

export function getLlmProvider(): LLMProvider {
  if (!cachedProvider) {
    const config = loadAiConfig();
    assertAiConfigEnabled(config);
    cachedProvider = createLlmProvider(config);
  }
  return cachedProvider;
}

export function resetLlmProviderForTests(): void {
  cachedProvider = null;
}

export function isAiEnabled(): boolean {
  return loadAiConfig().enabled;
}
