import type { Request } from 'express';
import type { AuthUser } from '../middleware/authToken.js';

export const DEFAULT_TENANT_ID = 'default';

/** Normalize tenant id from DB/JWT; existing single-tenant data uses `default`. */
export function normalizeTenantId(value: unknown): string {
  const tid = String(value ?? '').trim();
  return tid || DEFAULT_TENANT_ID;
}

export function tenantIdFromAuthUser(user: AuthUser | undefined | null): string {
  return normalizeTenantId(user?.tenantId);
}

/** Resolved tenant on authenticated requests (set by resolveTenant middleware). */
export function getRequestTenantId(req: Request): string {
  return normalizeTenantId(req.tenantId);
}
