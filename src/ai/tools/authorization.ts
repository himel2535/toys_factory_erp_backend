import { userCanAccessSection } from '../../config/sectionAccess.js';
import type { AiExecutionContext } from '../context/types.js';
import type { ToolDefinition } from './types.js';

function userHasPermission(context: AiExecutionContext, permission: string): boolean {
  if (context.role === 'admin') return true;
  return context.allowedPermissions.includes(permission);
}

/** Tool-layer authorization — reuses Phase 2 section access semantics. */
export function userCanExecuteTool(context: AiExecutionContext, tool: ToolDefinition): boolean {
  if (context.role === 'admin') return true;

  if (tool.requiredSections?.length) {
    for (const section of tool.requiredSections) {
      if (!userCanAccessSection(context, section)) return false;
    }
  }

  if (tool.requiredPermissions?.length) {
    for (const permission of tool.requiredPermissions) {
      if (!userHasPermission(context, permission)) return false;
    }
  }

  return true;
}
