import { describe, expect, it } from 'vitest';
import { findForbiddenArgKeys } from '../../../../src/ai/tools/forbiddenArgs.js';

describe('forbiddenArgs', () => {
  it('detects forbidden top-level keys', () => {
    expect(findForbiddenArgKeys({ tenantId: 'evil', message: 'ok' })).toContain('tenantId');
    expect(findForbiddenArgKeys({ tenant: 'evil' })).toContain('tenant');
    expect(findForbiddenArgKeys({ userId: 'evil' })).toContain('userId');
    expect(findForbiddenArgKeys({ role: 'admin' })).toContain('role');
    expect(findForbiddenArgKeys({ session: 'abc' })).toContain('session');
    expect(findForbiddenArgKeys({ cookie: 'abc' })).toContain('cookie');
    expect(findForbiddenArgKeys({ authorization: 'Bearer x' })).toContain('authorization');
  });

  it('detects forbidden nested keys case-insensitively', () => {
    expect(findForbiddenArgKeys({ nested: { APIKey: 'x' } })).toContain('nested.APIKey');
  });

  it('allows safe keys', () => {
    expect(findForbiddenArgKeys({ message: 'hello', count: 1 })).toEqual([]);
  });

  it('detects forbidden keys inside arrays', () => {
    expect(findForbiddenArgKeys({ items: [{ tenantId: 'evil' }] })).toContain('items[0].tenantId');
  });

  it('detects snake_case forbidden keys', () => {
    expect(findForbiddenArgKeys({ tenant_id: 'evil' })).toContain('tenant_id');
    expect(findForbiddenArgKeys({ user_id: 'evil' })).toContain('user_id');
  });
});
