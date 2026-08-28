import { describe, expect, it } from 'vitest';
import './fixtures/mockMetrics.js';
import { securityCases } from './dataset/security.js';
import { runEvalCase } from './harness/runCase.js';

describe('AI evaluation — security', () => {
  for (const evalCase of securityCases) {
    it(`${evalCase.id}: ${evalCase.description}`, async () => {
      const result = await runEvalCase(evalCase);
      expect(result.passed, result.failures.join('; ')).toBe(true);
    });
  }
});
