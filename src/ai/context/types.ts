/**
 * Trusted backend context for future AI routes and tool execution.
 * tenantId MUST come from resolveTenant / getRequestTenantId — never from LLM arguments.
 */
export type AiExecutionContext = {
  tenantId: string;
  userId: string;
  role?: string;
  email?: string;
  name?: string;
  allowedSections: string[];
  allowedPermissions: string[];
};
