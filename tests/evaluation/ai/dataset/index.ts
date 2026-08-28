import { agentLoopCases } from './agent-loop.js';
import { ambiguousCases } from './ambiguous.js';
import { errorCases } from './errors.js';
import { securityCases } from './security.js';
import { simpleFactualCases } from './simple-factual.js';
import { timeRangeCases } from './time-range.js';
import { toolArgsCases } from './tool-args.js';
import { toolSelectionCases } from './tool-selection.js';

export const EVAL_CASES = [
  ...simpleFactualCases,
  ...timeRangeCases,
  ...toolSelectionCases,
  ...toolArgsCases,
  ...agentLoopCases,
  ...securityCases,
  ...ambiguousCases,
  ...errorCases,
];

export {
  agentLoopCases,
  ambiguousCases,
  errorCases,
  securityCases,
  simpleFactualCases,
  timeRangeCases,
  toolArgsCases,
  toolSelectionCases,
};
