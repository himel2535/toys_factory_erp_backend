#!/usr/bin/env node
/**
 * Manual Groq + ERP AI smoke test. Reads AI_* from environment / .env — never hardcodes keys.
 *
 * Usage (after adding AI_API_KEY to .env or exporting it):
 *   node scripts/test-groq-ai-live.mjs
 *   node scripts/test-groq-ai-live.mjs "আজকের sales কত?"
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../dist/config/database.js';
import { loadAiConfig } from '../dist/ai/config/aiConfig.js';
import { createLlmProvider } from '../dist/ai/providers/createProvider.js';
import { runAiChat } from '../dist/ai/chat/aiChatService.js';
import { createAiRequestMetricsTracker } from '../dist/ai/chat/aiRequestMetrics.js';
import { ensureProductionToolsRegistered } from '../dist/ai/tools/business/registerProductionTools.js';

const PROMPTS = [
  { prompt: 'আজকের sales কত?', expectedTool: 'getTodaySales' },
  { prompt: 'গত ৭ দিনের sales trend দেখাও', expectedTool: 'getSalesTrend' },
  { prompt: 'আজকে low stock কত?', expectedTool: 'getLowStockCount' },
  { prompt: 'dashboard-এর summary দাও', expectedTool: 'getDashboardSummary' },
];

const adminContext = {
  tenantId: process.env.TEST_TENANT_ID ?? 'default',
  userId: 'live-test-user',
  role: 'admin',
  allowedSections: ['*'],
  allowedPermissions: ['*'],
};

function patchProviderForToolCapture(provider) {
  const calls = [];
  return {
    provider: {
      providerId: provider.providerId,
      async generate(input, options) {
        return provider.generate(input, options);
      },
      async generateWithTools(input, options) {
        const result = await provider.generateWithTools(input, options);
        for (const call of result.toolCalls) {
          calls.push(call.function.name);
        }
        return result;
      },
    },
    calls,
  };
}

async function main() {
  const config = loadAiConfig();
  if (!config.enabled) {
    console.error('Set AI_ENABLED=true and Groq env vars before running.');
    process.exit(1);
  }
  if (!config.apiKey && !config.allowMissingKey) {
    console.error('Set AI_API_KEY in .env (not committed) before running.');
    process.exit(1);
  }

  ensureProductionToolsRegistered();
  await connectDatabase();
  const baseProvider = createLlmProvider(config);
  const singlePrompt = process.argv[2];
  const scenarios = singlePrompt
    ? [{ prompt: singlePrompt, expectedTool: '(any)' }]
    : PROMPTS;

  console.log(`Provider: ${config.provider} model=${config.model} base=${config.baseUrl}`);

  for (const { prompt, expectedTool } of scenarios) {
    const started = Date.now();
    const tracker = createAiRequestMetricsTracker({ requestId: `live-${Date.now()}` });
    const { provider, calls } = patchProviderForToolCapture(baseProvider);
    const result = await runAiChat({
      context: adminContext,
      message: prompt,
      provider,
      env: process.env,
      metricsTracker: tracker,
      requestId: tracker.requestId,
    });
    const totalMs = Date.now() - started;
    const toolOk = expectedTool === '(any)' || calls.includes(expectedTool);
    console.log(JSON.stringify({
      prompt,
      expectedTool,
      toolsCalled: calls,
      toolOk,
      totalMs,
      providerMs: result.metrics.providerMs,
      toolMs: result.metrics.toolMs,
      providerCallCount: tracker.providerCallCount,
      toolCallCount: result.metrics.toolCallCount,
      toolRounds: result.metrics.toolRounds,
      totalTokens: result.metrics.usage.totalTokens || null,
      replyPreview: result.message.slice(0, 240),
    }));
  }

  await disconnectDatabase();
}

main().catch(async (error) => {
  try {
    await disconnectDatabase();
  } catch {
    // ignore disconnect errors during failure
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
