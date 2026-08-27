import type { AiExecutionContext } from '../../../../src/ai/context/types.js';
import type { ToolDefinition } from '../../../../src/ai/tools/types.js';

export const baseContext: AiExecutionContext = {
  tenantId: 'tenantA',
  userId: 'user-1',
  role: 'user',
  allowedSections: ['dashboard'],
  allowedPermissions: [],
};

export const adminContext: AiExecutionContext = {
  ...baseContext,
  role: 'admin',
  allowedSections: [],
  allowedPermissions: [],
};

export const wildcardContext: AiExecutionContext = {
  ...baseContext,
  allowedSections: ['*'],
};

export const payrollContext: AiExecutionContext = {
  ...baseContext,
  allowedSections: ['dashboard', 'payroll'],
};

export const inventoryEditContext: AiExecutionContext = {
  ...baseContext,
  allowedPermissions: ['inventory:edit'],
};

export const objectSchema = {
  type: 'object' as const,
  properties: {
    message: { type: 'string' as const },
    count: { type: 'integer' as const },
  },
  required: ['message'],
  additionalProperties: false,
};

export const testEchoTool: ToolDefinition = {
  name: 'testEcho',
  description: 'Echo validated args',
  inputSchema: objectSchema,
  execute(_context, args) {
    return { echoed: args };
  },
};

export const testRestrictedSectionTool: ToolDefinition = {
  name: 'testRestrictedSection',
  description: 'Requires payroll section',
  inputSchema: objectSchema,
  requiredSections: ['payroll'],
  execute() {
    return { ok: true };
  },
};

export const testRestrictedPermissionTool: ToolDefinition = {
  name: 'testRestrictedPermission',
  description: 'Requires inventory edit permission',
  inputSchema: objectSchema,
  requiredPermissions: ['inventory:edit'],
  execute() {
    return { ok: true };
  },
};

export const testContextProbeTool: ToolDefinition = {
  name: 'testContextProbe',
  description: 'Returns trusted tenant from context',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string' },
    },
    additionalProperties: false,
  },
  execute(context, args) {
    return {
      tenantId: context.tenantId,
      userId: context.userId,
      label: args.label,
    };
  },
};

export const testThrowingTool: ToolDefinition = {
  name: 'testThrowing',
  description: 'Always throws',
  inputSchema: objectSchema,
  execute() {
    throw new Error('secret internal failure with stack');
  },
};
