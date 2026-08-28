import { describe, expect, it } from 'vitest';
import './fixtures/mockMetrics.js';
import { toolSelectionCases } from './dataset/tool-selection.js';
import { runEvalCase } from './harness/runCase.js';

describe('AI evaluation — tool selection', () => {
  for (const evalCase of toolSelectionCases) {
    it(`${evalCase.id}: ${evalCase.description}`, async () => {
      const result = await runEvalCase(evalCase);
      expect(result.passed, result.failures.join('; ')).toBe(true);
    });
  }
});
