import type { AiExecutionContext } from '../../../../src/ai/context/types.js';
import type { LlmGenerateWithToolsResult } from '../../../../src/ai/types.js';

export type EvalCategory =
  | 'simple'
  | 'range'
  | 'tool-selection'
  | 'tool-args'
  | 'agent-loop'
  | 'security'
  | 'ambiguous'
  | 'error';

export type EvalExpectation = {
  toolsCalled?: string[];
  toolArgs?: Array<Record<string, unknown>>;
  forbiddenArgKeys?: string[];
  noDuplicateTools?: boolean;
  maxToolCalls?: number;
  finalContains?: string[];
  finalNotContains?: string[];
  promptGuardBlocked?: boolean;
  refusalContains?: string[];
  errorType?: 'timeout' | '429' | '502';
  apiErrorStatus?: number;
  maxTotalTokens?: number;
  rbacDenied?: boolean;
};

export type EvalCase = {
  id: string;
  category: EvalCategory;
  description: string;
  userMessage?: string;
  context?: Partial<AiExecutionContext>;
  providerScript?: LlmGenerateWithToolsResult[];
  mockToolData?: Record<string, unknown>;
  expect: EvalExpectation;
};

export type EvalCaseResult = {
  id: string;
  category: EvalCategory;
  passed: boolean;
  failures: string[];
  toolSelectionOk: boolean | null;
  toolArgsOk: boolean | null;
  finalAnswerOk: boolean | null;
  securityOk: boolean | null;
  duplicateTools: boolean;
  totalTokens: number | null;
  toolsCalled: string[];
};

export type EvalReport = {
  totalCases: number;
  passedCases: number;
  toolSelectionAccuracy: number | null;
  toolSelectionApplicable: number;
  toolSelectionPassed: number;
  toolArgsAccuracy: number | null;
  toolArgsApplicable: number;
  toolArgsPassed: number;
  finalAnswerPassRate: number | null;
  finalAnswerApplicable: number;
  finalAnswerPassed: number;
  securityPassRate: number | null;
  securityApplicable: number;
  securityPassed: number;
  duplicateCallRate: number | null;
  duplicateCallCases: number;
  duplicateCallCount: number;
  offlinePass: boolean;
  overallPass: boolean;
  results: EvalCaseResult[];
};
