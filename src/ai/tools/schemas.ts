import type { JsonSchema, ToolArgsValidationResult } from './types.js';

function typeOfValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value: unknown, expected: JsonSchema['type']): boolean {
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  if (expected === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return typeOfValue(value) === expected;
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    errors.push(`${path}: value is not in enum`);
    return;
  }

  if (!matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOfValue(value)}`);
    return;
  }

  if (schema.type === 'object') {
    const objectValue = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    const allowExtra = schema.additionalProperties === true;

    for (const key of required) {
      if (!(key in objectValue)) {
        errors.push(`${path}.${key}: required property missing`);
      }
    }

    for (const key of Object.keys(objectValue)) {
      if (!allowExtra && !(key in properties)) {
        errors.push(`${path}.${key}: additional property not allowed`);
        continue;
      }
      if (key in properties) {
        validateNode(objectValue[key], properties[key]!, `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!schema.items) return;
    for (let i = 0; i < (value as unknown[]).length; i += 1) {
      validateNode((value as unknown[])[i], schema.items, `${path}[${i}]`, errors);
    }
  }
}

export function validateToolArgs(
  schema: JsonSchema,
  raw: unknown,
): ToolArgsValidationResult {
  if (schema.type !== 'object') {
    return { ok: false, errors: ['Tool input schema root must be type object'] };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Tool arguments must be a JSON object'] };
  }

  const errors: string[] = [];
  validateNode(raw, schema, '$', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: raw as Record<string, unknown> };
}
