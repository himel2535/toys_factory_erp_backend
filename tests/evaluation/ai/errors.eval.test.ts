import { describe, expect, it } from 'vitest';
import './fixtures/mockMetrics.js';
import { errorCases } from './dataset/errors.js';
import { runEvalCase } from './harness/runCase.js';

describe('AI evaluation — errors', () => {
  for (const evalCase of errorCases) {
    it(`${evalCase.id}: ${evalCase.description}`, async () => {
      const result = await runEvalCase(evalCase);
      expect(result.passed, result.failures.join('; ')).toBe(true);
    });
  }
});
