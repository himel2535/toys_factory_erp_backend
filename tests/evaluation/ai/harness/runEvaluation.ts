import { runEvalCase } from './runCase.js';
import type { EvalCase, EvalReport } from './types.js';

function pct(passed: number, applicable: number): number | null {
  if (applicable === 0) return null;
  return Math.round((passed / applicable) * 1000) / 10;
}

export async function runEvaluation(cases: EvalCase[]): Promise<EvalReport> {
  const results = [];
  for (const evalCase of cases) {
    results.push(await runEvalCase(evalCase));
  }

  const passedCases = results.filter((r) => r.passed).length;

  const toolSelectionApplicable = results.filter((r) => r.toolSelectionOk !== null).length;
  const toolSelectionPassed = results.filter((r) => r.toolSelectionOk === true).length;

  const toolArgsApplicable = results.filter((r) => r.toolArgsOk !== null).length;
  const toolArgsPassed = results.filter((r) => r.toolArgsOk === true).length;

  const finalAnswerApplicable = results.filter((r) => r.finalAnswerOk !== null).length;
  const finalAnswerPassed = results.filter((r) => r.finalAnswerOk === true).length;

  const securityApplicable = results.filter((r) => r.securityOk !== null).length;
  const securityPassed = results.filter((r) => r.securityOk === true).length;

  const agentCases = results.filter((r) =>
    ['simple', 'range', 'tool-selection', 'tool-args', 'agent-loop'].includes(r.category),
  );
  const duplicateCallCount = agentCases.filter((r) => r.duplicateTools).length;
  const duplicateCallCases = agentCases.length;

  const securityPassRate = pct(securityPassed, securityApplicable);
  const toolArgsAccuracy = pct(toolArgsPassed, toolArgsApplicable);
  const overallPass =
    passedCases === results.length
    && (securityPassRate === null || securityPassRate === 100)
    && (toolArgsAccuracy === null || toolArgsAccuracy === 100);

  return {
    totalCases: results.length,
    passedCases,
    toolSelectionAccuracy: pct(toolSelectionPassed, toolSelectionApplicable),
    toolSelectionApplicable,
    toolSelectionPassed,
    toolArgsAccuracy,
    toolArgsApplicable,
    toolArgsPassed,
    finalAnswerPassRate: pct(finalAnswerPassed, finalAnswerApplicable),
    finalAnswerApplicable,
    finalAnswerPassed,
    securityPassRate,
    securityApplicable,
    securityPassed,
    duplicateCallRate: duplicateCallCases === 0 ? null : pct(duplicateCallCount, duplicateCallCases),
    duplicateCallCases,
    duplicateCallCount,
    offlinePass: passedCases === results.length,
    overallPass,
    results,
  };
}
