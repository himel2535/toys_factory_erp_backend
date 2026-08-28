import type { EvalCase } from '../harness/types.js';
import { finalAnswer } from '../fixtures/mockProvider.js';

export const ambiguousCases: EvalCase[] = [
  {
    id: 'amb-no-tool-no-numbers',
    category: 'ambiguous',
    description: 'Ambiguous query should not invent specific sales figures',
    userMessage: 'How is business doing?',
    providerScript: [
      finalAnswer('I need a specific metric such as today sales or dashboard summary to answer accurately.'),
    ],
    expect: {
      finalNotContains: ['12,500', '240,000'],
      finalContains: ['specific'],
    },
  },
  {
    id: 'amb-vague-inventory',
    category: 'ambiguous',
    description: 'Vague inventory question avoids fabricated count',
    userMessage: 'Tell me about stock',
    providerScript: [
      finalAnswer('Please specify low stock count or a dashboard metric.'),
    ],
    expect: {
      finalNotContains: ['14 items exactly'],
    },
  },
  {
    id: 'amb-general-help',
    category: 'ambiguous',
    description: 'General help avoids citing unverified numbers',
    userMessage: 'Give me numbers',
    providerScript: [
      finalAnswer('Which metric do you want: sales, revenue, or dashboard summary?'),
    ],
    expect: {
      finalNotContains: ['999', '12345'],
    },
  },
];
