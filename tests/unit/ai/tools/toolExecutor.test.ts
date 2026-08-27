import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolCall } from '../../../../src/ai/tools/toolExecutor.js';
import {
  registerTool,
  resetToolRegistryForTests,
} from '../../../../src/ai/tools/toolRegistry.js';
import {
  adminContext,
  baseContext,
  inventoryEditContext,
  payrollContext,
  testContextProbeTool,
  testEchoTool,
  testRestrictedPermissionTool,
  testRestrictedSectionTool,
  testThrowingTool,
} from './fixtures/mockTools.js';

describe('executeToolCall', () => {
  afterEach(() => {
    resetToolRegistryForTests();
    vi.restoreAllMocks();
  });

  it('executes a registered tool with validated arguments', async () => {
    registerTool(testEchoTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_1',
      type: 'function',
      function: { name: 'testEcho', arguments: '{"message":"hello"}' },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echoed: { message: 'hello' } });
  });

  it('rejects unknown tools without invoking handlers', async () => {
    const spy = vi.fn();
    registerTool({
      ...testEchoTool,
      execute: spy,
    });

    const result = await executeToolCall(baseContext, {
      id: 'call_2',
      type: 'function',
      function: { name: 'missing', arguments: '{}' },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON arguments', async () => {
    registerTool(testEchoTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_3',
      type: 'function',
      function: { name: 'testEcho', arguments: '{bad json' },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('rejects forbidden tenantId from model arguments', async () => {
    registerTool(testContextProbeTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_4',
      type: 'function',
      function: {
        name: 'testContextProbe',
        arguments: '{"tenantId":"evil","label":"x"}',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_VALIDATION_FAILED');
  });

  it('passes trusted AiExecutionContext to handler', async () => {
    registerTool(testContextProbeTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_5',
      type: 'function',
      function: { name: 'testContextProbe', arguments: '{"label":"probe"}' },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      tenantId: 'tenantA',
      userId: 'user-1',
      label: 'probe',
    });
  });

  it('rejects unauthorized section', async () => {
    registerTool(testRestrictedSectionTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_6',
      type: 'function',
      function: { name: 'testRestrictedSection', arguments: '{"message":"x"}' },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
  });

  it('allows authorized section', async () => {
    registerTool(testRestrictedSectionTool);
    const result = await executeToolCall(payrollContext, {
      id: 'call_7',
      type: 'function',
      function: { name: 'testRestrictedSection', arguments: '{"message":"x"}' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unauthorized permission', async () => {
    registerTool(testRestrictedPermissionTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_8',
      type: 'function',
      function: { name: 'testRestrictedPermission', arguments: '{"message":"x"}' },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TOOL_AUTH_DENIED');
  });

  it('allows required permission', async () => {
    registerTool(testRestrictedPermissionTool);
    const result = await executeToolCall(inventoryEditContext, {
      id: 'call_9',
      type: 'function',
      function: { name: 'testRestrictedPermission', arguments: '{"message":"x"}' },
    });
    expect(result.ok).toBe(true);
  });

  it('allows admin for restricted tools', async () => {
    registerTool(testRestrictedSectionTool);
    const result = await executeToolCall(adminContext, {
      id: 'call_10',
      type: 'function',
      function: { name: 'testRestrictedSection', arguments: '{"message":"x"}' },
    });
    expect(result.ok).toBe(true);
  });

  it('normalizes handler errors without exposing stack traces', async () => {
    registerTool(testThrowingTool);
    const result = await executeToolCall(baseContext, {
      id: 'call_11',
      type: 'function',
      function: { name: 'testThrowing', arguments: '{"message":"x"}' },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Tool execution failed');
    expect(result.error?.message).not.toContain('secret');
    expect(result.error?.message).not.toContain('stack');
  });
});
