import type { JsonSchema } from '../types.js';

export const chartRangeProperty: JsonSchema = {
  type: 'string',
  enum: ['day', 'week', 'month', 'quarter', 'year'],
};

export const summaryScopeProperty: JsonSchema = {
  type: 'string',
  enum: ['kpi', 'extra', 'full'],
};

export const chartRangeInputSchema: JsonSchema = {
  type: 'object',
  properties: {
    range: chartRangeProperty,
  },
  required: ['range'],
  additionalProperties: false,
};

export const summaryScopeInputSchema: JsonSchema = {
  type: 'object',
  properties: {
    scope: summaryScopeProperty,
  },
  additionalProperties: false,
};

export const emptyInputSchema: JsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
