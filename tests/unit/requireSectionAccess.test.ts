import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireSectionAccess } from '../../src/middleware/requireSectionAccess.js';
import { requireInventoryEdit } from '../../src/middleware/requireInventoryEdit.js';
import { resolveTenant } from '../../src/middleware/resolveTenant.js';
import { ApiError } from '../../src/utils/ApiError.js';
import type { AuthUser } from '../../src/middleware/authToken.js';

function mockReq(overrides: Partial<Request> & { user?: AuthUser } = {}): Request {
  return {
    method: 'GET',
    path: '/dashboard/summary',
    query: {},
    body: {},
    tenantId: 'tenantA',
    ...overrides,
  } as Request;
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
) {
  let error: unknown;
  const res = {} as Response;
  const next: NextFunction = (err?: unknown) => {
    error = err;
  };
  middleware(req, res, next);
  return error;
}

describe('requireSectionAccess middleware', () => {
  it('TEST 1: user with dashboard access can access dashboard', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({ user: { _id: 'u1', allowedSections: ['dashboard'] }, path: '/dashboard/summary' }),
    );
    expect(error).toBeUndefined();
  });

  it('TEST 2: user without dashboard access receives 403', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({ user: { _id: 'u1', allowedSections: ['inventory'] }, path: '/dashboard/summary' }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('TEST 3: user without payroll access cannot access payroll', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard'] },
        path: '/salary-sheet/summary',
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('TEST 4: user without accounts access cannot access financial endpoints', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard'] },
        path: '/profit-loss/summary',
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('TEST 5: user without reports access cannot access reports', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard'] },
        path: '/reports/sales',
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('TEST 6: user without hrm access cannot access employees', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard'] },
        path: '/employees',
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('TEST 7: admin can access all mapped paths', () => {
    const paths = ['/dashboard/summary', '/reports/sales', '/employees', '/salary-sheet/summary'];
    for (const path of paths) {
      const error = runMiddleware(
        requireSectionAccess,
        mockReq({ user: { _id: 'admin', role: 'admin' }, path }),
      );
      expect(error).toBeUndefined();
    }
  });

  it('TEST 8: tenant isolation still rejects conflicting tenantId before section logic', () => {
    let tenantError: unknown;
    const req = mockReq({
      user: { _id: 'u1', tenantId: 'tenantA', allowedSections: ['dashboard'] },
      query: { tenantId: 'tenantB' },
      path: '/dashboard/summary',
    });
    const res = {} as Response;
    resolveTenant(req, res, (err) => {
      tenantError = err;
    });
    expect(tenantError).toBeInstanceOf(ApiError);
    expect((tenantError as ApiError).statusCode).toBe(403);
  });

  it('TEST 9: user with dashboard+inventory retains inventory; payroll denied', () => {
    const inventoryOk = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard', 'inventory'] },
        path: '/products',
      }),
    );
    expect(inventoryOk).toBeUndefined();

    const payrollDenied = runMiddleware(
      requireSectionAccess,
      mockReq({
        user: { _id: 'u1', allowedSections: ['dashboard', 'inventory'] },
        path: '/payroll-runs',
      }),
    );
    expect(payrollDenied).toBeInstanceOf(ApiError);
  });

  it('TEST 10: inventory user without inventory:edit still blocked on PUT by requireInventoryEdit', () => {
    const sectionOk = runMiddleware(
      requireSectionAccess,
      mockReq({
        method: 'PUT',
        user: { _id: 'u1', allowedSections: ['inventory'] },
        path: '/products/123',
      }),
    );
    expect(sectionOk).toBeUndefined();

    const editDenied = runMiddleware(
      requireInventoryEdit,
      mockReq({
        method: 'PUT',
        user: { _id: 'u1', allowedSections: ['inventory'], allowedPermissions: [] },
        path: '/products/123',
      }),
    );
    expect(editDenied).toBeInstanceOf(ApiError);
    expect((editDenied as ApiError).statusCode).toBe(403);
  });

  it('TEST 11: unmapped API root allowed for any authenticated user', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({ user: { _id: 'u1', allowedSections: ['dashboard'] }, path: '/' }),
    );
    expect(error).toBeUndefined();
  });

  it('denies when user is missing on a mapped path', () => {
    const error = runMiddleware(
      requireSectionAccess,
      mockReq({ path: '/reports/sales' }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(403);
  });
});

describe('requireSectionAccess runs before controller work', () => {
  it('rejects unauthorized requests without invoking next handler chain', () => {
    const next = vi.fn();
    const req = mockReq({
      user: { _id: 'u1', allowedSections: ['dashboard'] },
      path: '/employees',
    });
    requireSectionAccess(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
  });
});
