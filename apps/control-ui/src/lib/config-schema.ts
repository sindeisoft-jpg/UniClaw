/**
 * Config schema helpers for channel config form.
 * Aligned with openclaw 2 ui/views/channels.config.ts and config-form.
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
  nullable?: boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function schemaType(schema: JsonSchema | null | undefined): string | undefined {
  if (!schema) return undefined;
  const t = schema.type;
  if (Array.isArray(t)) {
    const filtered = t.filter((x) => x !== "null");
    return filtered[0] ?? t[0];
  }
  return t;
}

/** Resolve schema node at path (e.g. ["channels", "whatsapp"]). */
export function resolveSchemaNode(
  schema: JsonSchema | null | undefined,
  path: (string | number)[],
): JsonSchema | null {
  let current: JsonSchema | null | undefined = schema;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    const type = schemaType(current);
    if (type === "object" && typeof key === "string") {
      const props = current.properties ?? {};
      current = props[key] ?? (current.additionalProperties as JsonSchema);
      continue;
    }
    if (type === "array" && typeof key === "number") {
      const items = Array.isArray(current.items) ? current.items[0] : current.items;
      current = items ?? null;
      continue;
    }
    return null;
  }
  return current && typeof current === "object" ? current : null;
}

/** Get channel config value from full config (config.channels[channelId] or config[channelId]). */
export function resolveChannelValue(
  config: Record<string, unknown> | null | undefined,
  channelId: string,
): Record<string, unknown> {
  if (!config || !isRecord(config)) return {};
  const channels = (config.channels ?? {}) as Record<string, unknown>;
  const fromChannels = channels[channelId];
  const fallback = config[channelId];
  const resolved =
    (fromChannels && isRecord(fromChannels) ? fromChannels : null) ??
    (fallback && isRecord(fallback) ? fallback : null);
  return resolved ?? {};
}

export function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

export function pathKey(path: (string | number)[]): string {
  return path.filter((s) => typeof s === "string").join(".");
}

export function isSensitivePath(path: (string | number)[]): boolean {
  const key = pathKey(path).toLowerCase();
  return (
    key.includes("token") ||
    key.includes("password") ||
    key.includes("secret") ||
    key.includes("apikey") ||
    key.endsWith("key")
  );
}
