import { afterEach, describe, expect, it } from 'vitest';
import {
  executeLlmToolCalls,
  toolsToLlmDefinitions,
} from '../../../../src/ai/tools/llmToolBridge.js';
import {
  registerTool,
  resetToolRegistryForTests,
} from '../../../../src/ai/tools/toolRegistry.js';
import { baseContext, testEchoTool } from './fixtures/mockTools.js';

describe('llmToolBridge', () => {
  afterEach(() => {
    resetToolRegistryForTests();
  });

  it('converts tool definitions to LLM tool schema', () => {
    const defs = toolsToLlmDefinitions([testEchoTool]);
    expect(defs).toEqual([{
      type: 'function',
      function: {
        name: 'testEcho',
        description: 'Echo validated args',
        parameters: testEchoTool.inputSchema,
      },
    }]);
  });

  it('executes normalized LLM tool calls through the executor', async () => {
    registerTool(testEchoTool);
    const results = await executeLlmToolCalls(baseContext, [{
      id: 'call_1',
      type: 'function',
      function: { name: 'testEcho', arguments: '{"message":"via-bridge"}' },
    }]);

    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.data).toEqual({ echoed: { message: 'via-bridge' } });
  });
});
