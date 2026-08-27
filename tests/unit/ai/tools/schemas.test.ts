import { describe, expect, it } from 'vitest';
import { validateToolArgs } from '../../../../src/ai/tools/schemas.js';

const schema = {
  type: 'object' as const,
  properties: {
    message: { type: 'string' as const },
    count: { type: 'integer' as const },
  },
  required: ['message'],
  additionalProperties: false,
};

describe('validateToolArgs', () => {
  it('accepts valid arguments', () => {
    const result = validateToolArgs(schema, { message: 'hello', count: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ message: 'hello', count: 2 });
    }
  });

  it('rejects missing required arguments', () => {
    const result = validateToolArgs(schema, { count: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('required'))).toBe(true);
    }
  });

  it('rejects invalid argument types', () => {
    const result = validateToolArgs(schema, { message: 123 });
    expect(result.ok).toBe(false);
  });

  it('rejects additional properties by default', () => {
    const result = validateToolArgs(schema, { message: 'hello', extra: true });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object root arguments', () => {
    expect(validateToolArgs(schema, 'nope').ok).toBe(false);
    expect(validateToolArgs(schema, []).ok).toBe(false);
  });
});
