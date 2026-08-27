import { afterEach, describe, expect, it } from 'vitest';
import {
  getTool,
  hasTool,
  listTools,
  registerTool,
  resetToolRegistryForTests,
} from '../../../../src/ai/tools/toolRegistry.js';
import { ToolDuplicateNameError } from '../../../../src/ai/tools/errors.js';
import { testEchoTool } from './fixtures/mockTools.js';

describe('toolRegistry', () => {
  afterEach(() => {
    resetToolRegistryForTests();
  });

  it('registers a tool', () => {
    registerTool(testEchoTool);
    expect(hasTool('testEcho')).toBe(true);
    expect(getTool('testEcho')?.name).toBe('testEcho');
  });

  it('rejects duplicate registration', () => {
    registerTool(testEchoTool);
    expect(() => registerTool(testEchoTool)).toThrow(ToolDuplicateNameError);
  });

  it('lists only explicitly registered tools', () => {
    registerTool(testEchoTool);
    expect(listTools()).toHaveLength(1);
    expect(listTools()[0]?.name).toBe('testEcho');
  });

  it('returns undefined for unknown tool', () => {
    expect(getTool('missing')).toBeUndefined();
    expect(hasTool('missing')).toBe(false);
  });
});
