import { describe, expect, it } from 'vitest';
import { userCanExecuteTool } from '../../../../src/ai/tools/authorization.js';
import {
  adminContext,
  baseContext,
  inventoryEditContext,
  payrollContext,
  testRestrictedPermissionTool,
  testRestrictedSectionTool,
  wildcardContext,
} from './fixtures/mockTools.js';

describe('userCanExecuteTool', () => {
  it('allows admin regardless of section restrictions', () => {
    expect(userCanExecuteTool(adminContext, testRestrictedSectionTool)).toBe(true);
  });

  it('allows wildcard section access', () => {
    expect(userCanExecuteTool(wildcardContext, testRestrictedSectionTool)).toBe(true);
  });

  it('denies unauthorized section', () => {
    expect(userCanExecuteTool(baseContext, testRestrictedSectionTool)).toBe(false);
  });

  it('allows authorized section', () => {
    expect(userCanExecuteTool(payrollContext, testRestrictedSectionTool)).toBe(true);
  });

  it('denies missing permission', () => {
    expect(userCanExecuteTool(baseContext, testRestrictedPermissionTool)).toBe(false);
  });

  it('allows required permission', () => {
    expect(userCanExecuteTool(inventoryEditContext, testRestrictedPermissionTool)).toBe(true);
  });
});
