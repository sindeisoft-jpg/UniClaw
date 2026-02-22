/**
 * Minimal config form helpers aligned with ui-legacy config-form.shared / controllers/config.
 */

export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

export type ConfigUiHints = Record<
  string,
  { label?: string; help?: string; order?: number }
>;

const META_KEYS = new Set(["title", "description", "default", "nullable"]);

/** True if schema has no real type (only meta keys); used for free-form map values. */
export function isAnySchema(schema: JsonSchema | null | undefined): boolean {
  if (!schema || typeof schema !== "object") return true;
  const keys = Object.keys(schema).filter((k) => !META_KEYS.has(k));
  return keys.length === 0;
}

export function schemaType(schema: JsonSchema | null | undefined): string | undefined {
  if (!schema) return undefined;
  const t = schema.type;
  if (Array.isArray(t)) {
    const filtered = t.filter((x) => x !== "null");
    return (filtered[0] ?? t[0]) as string;
  }
  return t as string;
}

export function pathKey(path: Array<string | number>): string {
  return path.filter((s) => typeof s === "string").join(".");
}

export function hintForPath(
  path: Array<string | number>,
  hints: ConfigUiHints,
): { label?: string; help?: string; order?: number } | undefined {
  const key = pathKey(path);
  return hints[key];
}

export function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

/** Default value for a schema (for new array items / map entries). */
export function defaultSchemaValue(schema?: JsonSchema | null): unknown {
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;
  const t = schemaType(schema);
  switch (t) {
    case "object":
      return {};
    case "array":
      return [];
    case "boolean":
      return false;
    case "number":
    case "integer":
      return 0;
    case "string":
      return "";
    default:
      return "";
  }
}

export function cloneConfigObject<T>(value: T): T {
  return structuredClone(value);
}

export function serializeConfigForm(form: Record<string, unknown>): string {
  return `${JSON.stringify(form, null, 2).trimEnd()}\n`;
}

export function setPathValue(
  obj: Record<string, unknown> | unknown[],
  path: Array<string | number>,
  value: unknown,
): void {
  if (path.length === 0) return;
  let current: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (typeof key === "number") {
      if (!Array.isArray(current)) return;
      if (current[key] == null) {
        current[key] = typeof nextKey === "number" ? [] : {};
      }
      current = current[key] as Record<string, unknown> | unknown[];
    } else {
      if (typeof current !== "object" || current == null) return;
      const record = current as Record<string, unknown>;
      if (record[key] == null) {
        record[key] = typeof nextKey === "number" ? [] : {};
      }
      current = record[key] as Record<string, unknown> | unknown[];
    }
  }
  const lastKey = path[path.length - 1];
  if (typeof lastKey === "number") {
    if (Array.isArray(current)) current[lastKey] = value;
    return;
  }
  if (typeof current === "object" && current != null) {
    (current as Record<string, unknown>)[lastKey] = value;
  }
}
