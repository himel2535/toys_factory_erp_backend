import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { AuthUser } from './authToken.js';
import { getRequestTenantId, normalizeTenantId, tenantIdFromAuthUser } from '../utils/tenantContext.js';

function clientTenantConflict(clientValue: unknown, tenantId: string): boolean {
  if (clientValue === undefined || clientValue === null) return false;
  const trimmed = String(clientValue).trim();
  if (!trimmed) return false;
  return trimmed !== tenantId;
}

/** Enforces authenticated user's tenant as the only authoritative tenant id. */
export function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user) {
    return next(new ApiError(401, 'Unauthorized'));
  }

  const tenantId = tenantIdFromAuthUser(user);
  req.tenantId = tenantId;

  if (clientTenantConflict(req.query.tenantId, tenantId)) {
    return next(new ApiError(403, 'Forbidden: tenantId mismatch'));
  }

  const method = req.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const body = req.body as Record<string, unknown> | undefined;
    if (body && clientTenantConflict(body.tenantId, tenantId)) {
      return next(new ApiError(403, 'Forbidden: tenantId mismatch'));
    }
  }

  next();
}

/** For cache helpers when middleware may not have run. */
export function resolvedCacheTenantId(req: Request): string {
  return getRequestTenantId(req);
}

/** Attach normalized tenant id to auth user objects from DB/cache. */
export function attachAuthUserTenant(authUser: AuthUser, jwtTenantId?: string): AuthUser {
  authUser.tenantId = normalizeTenantId(authUser.tenantId ?? jwtTenantId);
  return authUser;
}
