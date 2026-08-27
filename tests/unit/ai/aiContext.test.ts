import { describe, expect, it } from 'vitest';
import { buildAiExecutionContext } from '../../../src/ai/context/buildAiContext.js';
import { LlmValidationError } from '../../../src/ai/errors.js';

describe('buildAiExecutionContext', () => {
  it('builds trusted context from auth user and tenant id', () => {
    const ctx = buildAiExecutionContext(
      {
        _id: 'user-1',
        role: 'admin',
        email: 'admin@example.com',
        name: 'Admin',
        allowedSections: ['dashboard'],
        allowedPermissions: ['inventory.edit'],
      },
      'tenantA',
    );

    expect(ctx).toEqual({
      tenantId: 'tenantA',
      userId: 'user-1',
      role: 'admin',
      email: 'admin@example.com',
      name: 'Admin',
      allowedSections: ['dashboard'],
      allowedPermissions: ['inventory.edit'],
    });
  });

  it('normalizes tenant id through shared tenant helper', () => {
    const ctx = buildAiExecutionContext({ _id: 'user-1' }, '  ');
    expect(ctx.tenantId).toBe('default');
  });

  it('rejects missing user id', () => {
    expect(() => buildAiExecutionContext({ _id: '' }, 'tenantA')).toThrow(LlmValidationError);
  });
});
