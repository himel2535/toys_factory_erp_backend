/** Section IDs — mirrors frontend `section-access.ts`. */
export const ALL_SECTION_IDS = [
  'dashboard',
  'sales-crm',
  'inventory',
  'purchases',
  'factory',
  'accounts',
  'hrm',
  'payroll',
  'projects',
  'assets',
  'approvals',
  'reports',
  'administration',
  'settings',
] as const;

export type SectionId = (typeof ALL_SECTION_IDS)[number];

const VALID_SECTION_SET = new Set<string>(ALL_SECTION_IDS);

export function normalizeAllowedSections(sections: unknown): string[] {
  if (!Array.isArray(sections)) return ['dashboard'];
  if (sections.includes('*')) return ['*'];
  const filtered = sections
    .map((s) => String(s).trim())
    .filter((s) => VALID_SECTION_SET.has(s));
  return filtered.length ? filtered : ['dashboard'];
}

export function normalizeAllowedPermissions(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.map((p) => String(p).trim()).filter(Boolean);
}

export type SectionAuthUser = {
  status?: string;
  role?: string;
  allowedSections?: string[];
};

/** Mirrors frontend `canAccessSection()`. */
export function userCanAccessSection(
  user: SectionAuthUser | null | undefined,
  sectionId: SectionId | string,
): boolean {
  if (!user || user.status === 'disabled') return false;
  if (user.role === 'admin') return true;

  const sections = normalizeAllowedSections(user.allowedSections);
  if (sections.includes('*')) return true;
  return sections.includes(sectionId);
}
