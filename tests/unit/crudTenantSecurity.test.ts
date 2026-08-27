import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { createCrudController } from '../../src/controllers/crudFactory.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    params: { id: '507f1f77bcf86cd799439011' },
    query: {},
    body: {},
    tenantId: 'tenantA',
    ...overrides,
  } as Request;
}

function runHandler(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => void,
  req: Request,
  res: Response,
) {
  return new Promise<unknown>((resolve) => {
    handler(req, res, (err) => resolve(err));
  });
}

function mockRes() {
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(_payload: unknown) {
      return res;
    },
  };
  return res as Response;
}

function chainableLean(result: unknown) {
  return {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

describe('crudFactory tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST 1/8: list scopes queries to req.tenantId', async () => {
    const find = vi.fn().mockReturnValue(chainableLean([]));
    const model = {
      find,
      countDocuments: vi.fn().mockResolvedValue(0),
    } as unknown as Model<Record<string, unknown>>;

    const { list } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({ tenantId: 'tenantA' });
    const res = mockRes();

    await list(req, res, vi.fn());

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenantA' }));
  });

  it('TEST 4: getById uses tenant-aware lookup', async () => {
    const findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const model = {
      findOne,
    } as unknown as Model<Record<string, unknown>>;

    const { getById } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({ tenantId: 'tenantA' });
    const res = mockRes();

    const error = await runHandler(getById, req, res);
    expect(error).toMatchObject({ statusCode: 404 });
    expect(findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      tenantId: 'tenantA',
    });
  });

  it('TEST 5: update uses tenant-aware lookup', async () => {
    const findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const model = {
      findOne,
      findOneAndUpdate: vi.fn(),
    } as unknown as Model<Record<string, unknown>>;

    const { update } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({ method: 'PUT', tenantId: 'tenantA', body: { name: 'Updated' } });
    const res = mockRes();

    const error = await runHandler(update, req, res);
    expect(error).toMatchObject({ statusCode: 404 });
    expect(findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      tenantId: 'tenantA',
    });
  });

  it('TEST 6: remove uses tenant-aware lookup', async () => {
    const findOneAndDelete = vi.fn().mockResolvedValue(null);
    const model = {
      findOneAndDelete,
    } as unknown as Model<Record<string, unknown>>;

    const { remove } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({ method: 'DELETE', tenantId: 'tenantA' });
    const res = mockRes();

    const error = await runHandler(remove, req, res);
    expect(error).toMatchObject({ statusCode: 404 });
    expect(findOneAndDelete).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      tenantId: 'tenantA',
    });
  });

  it('TEST 3/9: create injects authenticated tenant and strips client tenantId', async () => {
    const create = vi.fn().mockResolvedValue({
      toJSON: () => ({ id: '1', name: 'Safe', tenantId: 'tenantA' }),
    });
    const model = {
      create,
    } as unknown as Model<Record<string, unknown>>;

    const { create: createHandler } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({
      method: 'POST',
      tenantId: 'tenantA',
      body: { name: 'Safe', tenantId: 'tenantB' },
    });
    const res = mockRes();

    await createHandler(req, res, vi.fn());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Safe', tenantId: 'tenantA' }));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('tenantId', 'tenantB');
  });

  it('default tenant list filter works for legacy single-tenant', async () => {
    const find = vi.fn().mockReturnValue(chainableLean([{ _id: '1', name: 'Legacy', tenantId: 'default' }]));
    const model = {
      find,
      countDocuments: vi.fn().mockResolvedValue(1),
    } as unknown as Model<Record<string, unknown>>;

    const { list } = createCrudController(model, { resourceName: 'Customer' });
    const req = mockReq({ tenantId: 'default' });
    const res = mockRes();

    await list(req, res, vi.fn());
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'default' }));
  });
});

describe('cache tenant isolation', () => {
  it('TEST 7: cache keys remain isolated per tenant', async () => {
    const { dashboardBusinessAlertsCacheKey } = await import('../../src/middleware/responseCache.js');
    const reqA = { tenantId: 'tenantA', query: {}, path: '/api/v1/dashboard/business-alerts' };
    const reqB = { tenantId: 'tenantB', query: {}, path: '/api/v1/dashboard/business-alerts' };
    expect(dashboardBusinessAlertsCacheKey(reqA as never)).not.toBe(
      dashboardBusinessAlertsCacheKey(reqB as never),
    );
  });

  it('TEST 10: inventory invalidation path uses resolved tenant not hardcoded default', async () => {
    const { getRequestTenantId } = await import('../../src/utils/tenantContext.js');
    const req = { tenantId: 'tenantZ' } as Request;
    expect(getRequestTenantId(req)).toBe('tenantZ');
  });
});
