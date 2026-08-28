const FORBIDDEN_ARG_KEYS = new Set([
  'tenantid',
  'tenant_id',
  'tenant',
  'userid',
  'user_id',
  'role',
  'allowedsections',
  'allowedpermissions',
  'permissions',
  'apikey',
  'password',
  'token',
  'secret',
  'session',
  'cookie',
  'authorization',
]);

function collectKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    const keys: string[] = [];
    value.forEach((item, index) => {
      const path = prefix ? `${prefix}[${index}]` : `[${index}]`;
      keys.push(...collectKeys(item, path));
    });
    return keys;
  }

  const keys: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);
    keys.push(...collectKeys(nested, path));
  }
  return keys;
}

export function findForbiddenArgKeys(args: unknown): string[] {
  const hits: string[] = [];
  for (const path of collectKeys(args)) {
    const leaf = path.split('.').pop() ?? path;
    if (FORBIDDEN_ARG_KEYS.has(leaf.toLowerCase())) {
      hits.push(path);
    }
  }
  return hits;
}

export function assertNoForbiddenArgKeys(args: unknown): void {
  const hits = findForbiddenArgKeys(args);
  if (hits.length > 0) {
    throw new Error(`Forbidden tool argument keys: ${hits.join(', ')}`);
  }
}
