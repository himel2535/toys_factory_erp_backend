import type { SectionId } from './sectionAccess.js';

/** Longest-prefix match: API path prefix → section id. */
const API_PREFIX_TO_SECTION: Array<{ prefix: string; section: SectionId }> = [
  // dashboard
  { prefix: '/dashboard', section: 'dashboard' },
  { prefix: '/ai', section: 'dashboard' },
  { prefix: '/notifications', section: 'dashboard' },

  // sales-crm
  { prefix: '/customers', section: 'sales-crm' },
  { prefix: '/sales-orders', section: 'sales-crm' },
  { prefix: '/invoices', section: 'sales-crm' },
  { prefix: '/leads', section: 'sales-crm' },
  { prefix: '/deals', section: 'sales-crm' },
  { prefix: '/quotations', section: 'sales-crm' },
  { prefix: '/deliveries', section: 'sales-crm' },
  { prefix: '/dispatch', section: 'sales-crm' },
  { prefix: '/payments', section: 'sales-crm' },
  { prefix: '/returns', section: 'sales-crm' },
  { prefix: '/complaints', section: 'sales-crm' },
  { prefix: '/pos-transactions', section: 'sales-crm' },
  { prefix: '/crm-activities', section: 'sales-crm' },
  { prefix: '/wholesale-orders', section: 'sales-crm' },

  // inventory
  { prefix: '/inventory', section: 'inventory' },
  { prefix: '/products', section: 'inventory' },
  { prefix: '/categories', section: 'inventory' },
  { prefix: '/units', section: 'inventory' },
  { prefix: '/warehouses', section: 'inventory' },
  { prefix: '/raw-materials', section: 'inventory' },
  { prefix: '/semi-finished-products', section: 'inventory' },
  { prefix: '/finished-goods', section: 'inventory' },
  { prefix: '/stock-in', section: 'inventory' },
  { prefix: '/stock-out', section: 'inventory' },
  { prefix: '/stock-transfers', section: 'inventory' },
  { prefix: '/stock-adjustments', section: 'inventory' },

  // purchases
  { prefix: '/suppliers', section: 'purchases' },
  { prefix: '/purchase-orders', section: 'purchases' },
  { prefix: '/goods-received', section: 'purchases' },
  { prefix: '/vendor-bills', section: 'purchases' },
  { prefix: '/purchase-payments', section: 'purchases' },
  { prefix: '/purchase-returns', section: 'purchases' },
  { prefix: '/recipes', section: 'purchases' },
  { prefix: '/purchase-rm', section: 'purchases' },

  // factory
  { prefix: '/production-orders', section: 'factory' },
  { prefix: '/machine-maintenance', section: 'factory' },
  { prefix: '/molds', section: 'factory' },
  { prefix: '/wastage', section: 'factory' },
  { prefix: '/packing', section: 'factory' },

  // accounts
  { prefix: '/journals', section: 'accounts' },
  { prefix: '/ledger', section: 'accounts' },
  { prefix: '/dues', section: 'accounts' },
  { prefix: '/cashbox', section: 'accounts' },
  { prefix: '/trial-balance', section: 'accounts' },
  { prefix: '/profit-loss', section: 'accounts' },
  { prefix: '/balance-sheet', section: 'accounts' },

  // hrm
  { prefix: '/employees', section: 'hrm' },
  { prefix: '/departments', section: 'hrm' },
  { prefix: '/designations', section: 'hrm' },
  { prefix: '/attendance', section: 'hrm' },
  { prefix: '/leave-requests', section: 'hrm' },

  // payroll
  { prefix: '/salary-structures', section: 'payroll' },
  { prefix: '/payroll-runs', section: 'payroll' },
  { prefix: '/payroll-slips', section: 'payroll' },
  { prefix: '/salary-sheet', section: 'payroll' },

  // projects
  { prefix: '/pm-projects', section: 'projects' },
  { prefix: '/pm-tasks', section: 'projects' },
  { prefix: '/projects', section: 'projects' },

  // assets
  { prefix: '/assets', section: 'assets' },

  // approvals
  { prefix: '/workflow-approvals', section: 'approvals' },

  // reports
  { prefix: '/reports', section: 'reports' },

  // administration
  { prefix: '/users', section: 'administration' },
  { prefix: '/roles', section: 'administration' },
  { prefix: '/permissions', section: 'administration' },
  { prefix: '/documents', section: 'administration' },
  { prefix: '/company-settings', section: 'administration' },
  { prefix: '/audit-logs', section: 'administration' },
];

/** Sort longest prefix first so `/pm-projects` wins over `/projects`. */
const SORTED_PREFIXES = [...API_PREFIX_TO_SECTION].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/** Map Express router path to section id; null = authenticated-only (no section gate). */
export function apiPathToSectionId(path: string): SectionId | null {
  const normalized = path.split('?')[0].split('#')[0];
  if (normalized === '/' || normalized === '') return null;

  for (const { prefix, section } of SORTED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return section;
    }
  }

  return null;
}
