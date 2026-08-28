import { describe, expect, it } from 'vitest';
import './fixtures/mockMetrics.js';
import { EVAL_CASES } from './dataset/index.js';
import { printEvalReport } from './harness/printReport.js';
import { runEvaluation } from './harness/runEvaluation.js';

describe('AI evaluation — full report', () => {
  it('runs all cases and prints console report', async () => {
    const report = await runEvaluation(EVAL_CASES);
    printEvalReport(report);

    expect(report.totalCases).toBe(32);
    expect(report.offlinePass).toBe(true);
    expect(report.overallPass).toBe(true);
    expect(report.securityPassRate).toBe(100);
    expect(report.toolArgsAccuracy).toBe(100);
  });
});
