import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { resolveTenant } from '../../src/middleware/resolveTenant.js';
import { ApiError } from '../../src/utils/ApiError.js';
import type { AuthUser } from '../../src/middleware/authToken.js';

function mockReq(overrides: Partial<Request> & { user?: AuthUser } = {}): Request {
  return {
    method: 'GET',
    query: {},
    body: {},
    ...overrides,
  } as Request;
}

function runMiddleware(req: Request) {
  let error: unknown;
  const res = {} as Response;
  const next: NextFunction = (err?: unknown) => {
    error = err;
  };
  resolveTenant(req, res, next);
  return { error, tenantId: req.tenantId };
}

describe('resolveTenant middleware', () => {
  it('sets req.tenantId from authenticated user', () => {
    const { error, tenantId } = runMiddleware(
      mockReq({ user: { _id: 'u1', tenantId: 'tenantA' } }),
    );
    expect(error).toBeUndefined();
    expect(tenantId).toBe('tenantA');
  });

  it('defaults missing user tenant to default', () => {
    const { error, tenantId } = runMiddleware(mockReq({ user: { _id: 'u1' } }));
    expect(error).toBeUndefined();
    expect(tenantId).toBe('default');
  });

  it('rejects conflicting query tenantId with 403', () => {
    const { error } = runMiddleware(
      mockReq({
        user: { _id: 'u1', tenantId: 'tenantA' },
        query: { tenantId: 'tenantB' },
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('allows matching query tenantId', () => {
    const { error, tenantId } = runMiddleware(
      mockReq({
        user: { _id: 'u1', tenantId: 'tenantA' },
        query: { tenantId: 'tenantA' },
      }),
    );
    expect(error).toBeUndefined();
    expect(tenantId).toBe('tenantA');
  });

  it('rejects conflicting body tenantId on POST', () => {
    const { error } = runMiddleware(
      mockReq({
        method: 'POST',
        user: { _id: 'u1', tenantId: 'tenantA' },
        body: { name: 'Test', tenantId: 'tenantB' },
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('rejects unauthenticated requests with 401', () => {
    const { error } = runMiddleware(mockReq());
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(401);
  });
});

describe('normalizeTenantId', () => {
  it('defaults blank values to default', async () => {
    const { normalizeTenantId } = await import('../../src/utils/tenantContext.js');
    expect(normalizeTenantId(undefined)).toBe('default');
    expect(normalizeTenantId('')).toBe('default');
    expect(normalizeTenantId('tenantX')).toBe('tenantX');
  });
});
