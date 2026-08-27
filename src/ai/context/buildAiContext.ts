import type { AuthUser } from '../../middleware/authToken.js';
import { normalizeTenantId } from '../../utils/tenantContext.js';
import { LlmValidationError } from '../errors.js';
import type { AiExecutionContext } from './types.js';

export function buildAiExecutionContext(user: AuthUser, tenantId: string): AiExecutionContext {
  const userId = String(user._id ?? '').trim();
  if (!userId) {
    throw new LlmValidationError('AI execution context requires an authenticated user id');
  }

  return {
    tenantId: normalizeTenantId(tenantId),
    userId,
    role: user.role,
    email: user.email,
    name: user.name,
    allowedSections: user.allowedSections ?? [],
    allowedPermissions: user.allowedPermissions ?? [],
  };
}
