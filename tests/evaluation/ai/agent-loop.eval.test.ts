import { describe, expect, it } from 'vitest';
import './fixtures/mockMetrics.js';
import { agentLoopCases } from './dataset/agent-loop.js';
import { runEvalCase } from './harness/runCase.js';

describe('AI evaluation — agent loop', () => {
  for (const evalCase of agentLoopCases) {
    it(`${evalCase.id}: ${evalCase.description}`, async () => {
      const result = await runEvalCase(evalCase);
      expect(result.passed, result.failures.join('; ')).toBe(true);
    });
  }
});
