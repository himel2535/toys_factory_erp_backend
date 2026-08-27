import { describe, expect, it } from 'vitest';
import {
  ALL_SECTION_IDS,
  normalizeAllowedSections,
  userCanAccessSection,
} from '../../src/config/sectionAccess.js';
import { apiPathToSectionId } from '../../src/config/apiSectionMap.js';

describe('sectionAccess', () => {
  it('exports all 14 frontend section ids', () => {
    expect(ALL_SECTION_IDS).toHaveLength(14);
    expect(ALL_SECTION_IDS).toContain('dashboard');
    expect(ALL_SECTION_IDS).toContain('administration');
  });

  it('normalizeAllowedSections defaults to dashboard', () => {
    expect(normalizeAllowedSections(undefined)).toEqual(['dashboard']);
    expect(normalizeAllowedSections([])).toEqual(['dashboard']);
    expect(normalizeAllowedSections(['invalid'])).toEqual(['dashboard']);
  });

  it('normalizeAllowedSections preserves wildcard', () => {
    expect(normalizeAllowedSections(['*'])).toEqual(['*']);
    expect(normalizeAllowedSections(['dashboard', '*'])).toEqual(['*']);
  });

  it('userCanAccessSection allows admin bypass', () => {
    expect(userCanAccessSection({ role: 'admin' }, 'payroll')).toBe(true);
  });

  it('userCanAccessSection allows wildcard sections', () => {
    expect(userCanAccessSection({ allowedSections: ['*'] }, 'reports')).toBe(true);
  });

  it('userCanAccessSection denies disabled users', () => {
    expect(
      userCanAccessSection({ status: 'disabled', allowedSections: ['dashboard'] }, 'dashboard'),
    ).toBe(false);
  });

  it('userCanAccessSection defaults missing sections to dashboard only', () => {
    expect(userCanAccessSection({}, 'dashboard')).toBe(true);
    expect(userCanAccessSection({}, 'payroll')).toBe(false);
  });

  it('userCanAccessSection checks explicit section membership', () => {
    expect(
      userCanAccessSection({ allowedSections: ['dashboard', 'inventory'] }, 'inventory'),
    ).toBe(true);
    expect(
      userCanAccessSection({ allowedSections: ['dashboard', 'inventory'] }, 'payroll'),
    ).toBe(false);
  });
});

describe('apiPathToSectionId', () => {
  it('maps dashboard routes', () => {
    expect(apiPathToSectionId('/dashboard/summary')).toBe('dashboard');
    expect(apiPathToSectionId('/notifications')).toBe('dashboard');
    expect(apiPathToSectionId('/ai/chat')).toBe('dashboard');
  });

  it('maps reports routes', () => {
    expect(apiPathToSectionId('/reports/sales')).toBe('reports');
  });

  it('maps payroll routes', () => {
    expect(apiPathToSectionId('/salary-sheet/summary')).toBe('payroll');
    expect(apiPathToSectionId('/payroll-runs')).toBe('payroll');
  });

  it('maps accounts routes', () => {
    expect(apiPathToSectionId('/profit-loss/summary')).toBe('accounts');
    expect(apiPathToSectionId('/trial-balance')).toBe('accounts');
  });

  it('maps hrm routes', () => {
    expect(apiPathToSectionId('/employees')).toBe('hrm');
    expect(apiPathToSectionId('/attendance/123')).toBe('hrm');
  });

  it('maps inventory low-stock alerts', () => {
    expect(apiPathToSectionId('/inventory/low-stock-alerts')).toBe('inventory');
  });

  it('returns null for API root index', () => {
    expect(apiPathToSectionId('/')).toBe(null);
  });

  it('prefers longer prefix for pm-projects over projects', () => {
    expect(apiPathToSectionId('/pm-projects/summary')).toBe('projects');
    expect(apiPathToSectionId('/projects/abc')).toBe('projects');
  });
});
