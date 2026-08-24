import { describe, expect, it } from 'vitest';
import { normalizeAggregationProjection } from '../../src/utils/facetQuery.js';

describe('normalizeAggregationProjection', () => {
  it('converts Mongoose select strings to Mongo $project objects', () => {
    expect(normalizeAggregationProjection('legacyId name company totalDue due status')).toEqual({
      legacyId: 1,
      name: 1,
      company: 1,
      totalDue: 1,
      due: 1,
      status: 1,
    });
  });

  it('preserves object projections', () => {
    const obj = { legacyId: 1, name: 1 } as const;
    expect(normalizeAggregationProjection(obj)).toBe(obj);
  });
});
