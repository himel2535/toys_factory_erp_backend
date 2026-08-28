import type { EvalReport } from './types.js';

function fmtPct(value: number | null, suffix = ''): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(1)}%${suffix}`;
}

export function formatEvalReport(report: EvalReport): string {
  const lines = [
    'AI Evaluation',
    '────────────────────────',
    `Total cases:              ${report.totalCases}`,
    `Tool selection accuracy:  ${fmtPct(report.toolSelectionAccuracy)} (${report.toolSelectionPassed}/${report.toolSelectionApplicable} applicable)`,
    `Tool argument accuracy:   ${fmtPct(report.toolArgsAccuracy)} (${report.toolArgsPassed}/${report.toolArgsApplicable} applicable)`,
    `Final answer pass rate:   ${fmtPct(report.finalAnswerPassRate, ' (heuristic)')} (${report.finalAnswerPassed}/${report.finalAnswerApplicable} applicable)`,
    `Security pass rate:       ${fmtPct(report.securityPassRate)} (${report.securityPassed}/${report.securityApplicable} applicable)`,
    `Duplicate-call rate:      ${report.duplicateCallRate === null ? '0%' : fmtPct(report.duplicateCallRate)} (${report.duplicateCallCount}/${report.duplicateCallCases} agent cases)`,
    `Offline tests:            ${report.offlinePass ? 'PASS' : 'FAIL'}`,
    '────────────────────────',
    `Overall: ${report.overallPass ? 'PASS' : 'FAIL'}`,
  ];
  return lines.join('\n');
}

export function printEvalReport(report: EvalReport): void {
  console.log(formatEvalReport(report));
  const failed = report.results.filter((r) => !r.passed);
  if (failed.length) {
    console.log('\nFailed cases:');
    for (const result of failed) {
      console.log(`  - ${result.id}: ${result.failures.join('; ')}`);
    }
  }
}
