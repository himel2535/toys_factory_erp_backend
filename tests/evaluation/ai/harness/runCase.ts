import { ApiError } from '../../../../src/utils/ApiError.js';
import { runAiChat } from '../../../../src/ai/chat/aiChatService.js';
import { checkPromptInjection } from '../../../../src/ai/chat/promptGuard.js';
import { mapAiChatError } from '../../../../src/ai/chat/mapAiChatError.js';
import { LlmProviderError, LlmTimeoutError } from '../../../../src/ai/errors.js';
import type { AiExecutionContext } from '../../../../src/ai/context/types.js';
import { resetToolRegistryForTests } from '../../../../src/ai/tools/toolRegistry.js';
import { ensureProductionToolsRegistered } from '../../../../src/ai/tools/business/registerProductionTools.js';
import { baseContext } from '../../../unit/ai/tools/fixtures/mockTools.js';
import { createScriptedProvider } from '../fixtures/mockProvider.js';
import { applyDefaultMetricMocks, resetMetricMocks } from '../fixtures/mockMetrics.js';
import {
  buildCaseResult,
  checkDuplicateTools,
  checkFinalAnswer,
  checkForbiddenArgsRejected,
  checkSecurity,
  checkTokenEfficiency,
  checkToolArgs,
  checkToolSelection,
} from './assertions.js';
import type { ScriptedProvider } from '../fixtures/mockProvider.js';
import type { EvalCase, EvalCaseResult } from './types.js';

function resolveContext(partial?: Partial<AiExecutionContext>): AiExecutionContext {
  return { ...baseContext, ...partial };
}

function createErrorProvider(errorType: 'timeout' | '429' | '502') {
  return {
    providerId: 'openai_compatible' as const,
    async generate() {
      throw new Error('unused');
    },
    async generateWithTools() {
      if (errorType === 'timeout') throw new LlmTimeoutError();
      if (errorType === '429') throw new LlmProviderError('rate limit', 429);
      throw new LlmProviderError('upstream failure', 502);
    },
  };
}

export async function runEvalCase(evalCase: EvalCase): Promise<EvalCaseResult> {
  resetToolRegistryForTests();
  resetMetricMocks();
  applyDefaultMetricMocks();
  ensureProductionToolsRegistered();

  const failures: string[] = [];
  let message = '';
  let toolsCalled: string[] = [];
  let parsedArgs: Array<Record<string, unknown>> = [];
  let totalTokens: number | null = null;
  let toolCallCount = 0;
  let promptGuardBlocked = false;
  let refusalMessage = '';
  let rbacDenied = false;
  let mappedErrorMessage = '';
  let toolPayloads: Array<{ error?: { code?: string } }> = [];

  function extractToolPayloads(provider: ScriptedProvider): void {
    toolPayloads = provider.calls.flatMap((call) =>
      call.messages
        .filter((m) => m.role === 'tool')
        .map((m) => JSON.parse(m.content) as { error?: { code?: string } }),
    );
  }

  // Prompt-guard-only cases (no agent loop)
  if (evalCase.expect.promptGuardBlocked !== undefined && !evalCase.providerScript) {
    const guard = checkPromptInjection(evalCase.userMessage ?? '');
    promptGuardBlocked = guard.blocked;
    if (guard.blocked) refusalMessage = guard.refusalMessage;
  } else if (evalCase.providerScript) {
    const provider = createScriptedProvider(evalCase.providerScript);
    if (evalCase.expect.errorType) {
      try {
        await runAiChat({
          context: resolveContext(evalCase.context),
          message: evalCase.userMessage ?? '',
          provider: createErrorProvider(evalCase.expect.errorType),
        });
        failures.push('expected provider error');
      } catch (error) {
        const mapped = mapAiChatError(error);
        mappedErrorMessage = mapped.message;
        if (evalCase.expect.errorType === 'timeout' && mapped.statusCode !== 504) {
          failures.push(`expected 504 got ${mapped.statusCode}`);
        }
        if (evalCase.expect.errorType === '429' && mapped.statusCode !== 429) {
          failures.push(`expected 429 got ${mapped.statusCode}`);
        }
        if (evalCase.expect.errorType === '502' && mapped.statusCode !== 502) {
          failures.push(`expected 502 got ${mapped.statusCode}`);
        }
      }
    } else {
      try {
        const result = await runAiChat({
          context: resolveContext(evalCase.context),
          message: evalCase.userMessage ?? '',
          provider,
        });
        message = result.message;
        toolCallCount = result.metrics.toolCallCount;
        totalTokens = result.metrics.usage.totalTokens || null;
        toolsCalled = provider.requestedToolCalls.map((t) => t.name);
        parsedArgs = provider.requestedToolCalls.map((t) => t.args);
        extractToolPayloads(provider);

        if (evalCase.expect.rbacDenied) {
          rbacDenied = message.toLowerCase().includes('access')
            || provider.calls.some((c) =>
              c.messages.some((m) => m.role === 'tool' && m.content.includes('TOOL_AUTH_DENIED')),
            );
        }
      } catch (error) {
        if (error instanceof ApiError) {
          mappedErrorMessage = error.message;
          if (evalCase.expect.apiErrorStatus !== undefined) {
            if (error.statusCode !== evalCase.expect.apiErrorStatus) {
              failures.push(`expected ApiError ${evalCase.expect.apiErrorStatus} got ${error.statusCode}`);
            }
          } else {
            failures.push(`unexpected ApiError ${error.statusCode}: ${error.message}`);
          }
          extractToolPayloads(provider);
          toolsCalled = provider.requestedToolCalls.map((t) => t.name);
          parsedArgs = provider.requestedToolCalls.map((t) => t.args);
        } else {
          failures.push(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  const toolSelection = checkToolSelection(toolsCalled, evalCase.expect);
  const toolArgs = checkToolArgs(parsedArgs, evalCase.expect);
  const forbiddenArgs = checkForbiddenArgsRejected(toolPayloads, evalCase.expect);
  const finalAnswer = checkFinalAnswer(message, evalCase.expect);
  const security = checkSecurity(evalCase.expect, {
    promptGuardBlocked,
    refusalMessage,
    rbacDenied,
    errorMessage: mappedErrorMessage,
  });
  const tokenEff = checkTokenEfficiency(totalTokens, evalCase.expect);
  const duplicateTools = checkDuplicateTools(toolsCalled, evalCase.expect);

  if (evalCase.expect.maxToolCalls !== undefined && toolCallCount > evalCase.expect.maxToolCalls) {
    failures.push(`toolCallCount ${toolCallCount} > max ${evalCase.expect.maxToolCalls}`);
  }
  if (evalCase.expect.noDuplicateTools && duplicateTools) {
    failures.push('duplicate tool calls detected');
  }

  failures.push(
    ...toolSelection.failures,
    ...toolArgs.failures,
    ...forbiddenArgs.failures,
    ...finalAnswer.failures,
    ...security.failures,
    ...tokenEff.failures,
  );

  const checks = [
    toolSelection.ok,
    toolArgs.ok,
    forbiddenArgs.ok,
    finalAnswer.ok,
    security.ok,
    tokenEff.ok,
  ].filter((v) => v !== null) as boolean[];

  const passed = failures.length === 0 && (checks.length === 0 || checks.every(Boolean));

  const mergedToolArgsOk =
    toolArgs.ok === null && forbiddenArgs.ok === null
      ? null
      : toolArgs.ok !== false && forbiddenArgs.ok !== false
        && (toolArgs.ok === true || forbiddenArgs.ok === true);

  return buildCaseResult(evalCase, {
    passed,
    failures,
    toolSelectionOk: toolSelection.ok,
    toolArgsOk: mergedToolArgsOk,
    finalAnswerOk: finalAnswer.ok,
    securityOk: security.ok,
    duplicateTools,
    totalTokens,
    toolsCalled,
  });
}
