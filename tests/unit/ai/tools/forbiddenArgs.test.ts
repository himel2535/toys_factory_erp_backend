import { describe, expect, it } from 'vitest';
import { findForbiddenArgKeys } from '../../../../src/ai/tools/forbiddenArgs.js';

describe('forbiddenArgs', () => {
  it('detects forbidden top-level keys', () => {
    expect(findForbiddenArgKeys({ tenantId: 'evil', message: 'ok' })).toContain('tenantId');
    expect(findForbiddenArgKeys({ userId: 'evil' })).toContain('userId');
    expect(findForbiddenArgKeys({ role: 'admin' })).toContain('role');
  });

  it('detects forbidden nested keys case-insensitively', () => {
    expect(findForbiddenArgKeys({ nested: { APIKey: 'x' } })).toContain('nested.APIKey');
  });

  it('allows safe keys', () => {
    expect(findForbiddenArgKeys({ message: 'hello', count: 1 })).toEqual([]);
  });
});
