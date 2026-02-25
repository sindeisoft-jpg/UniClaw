"use client";

import type { JsonSchema } from "@/lib/config-schema";
import {
  resolveSchemaNode,
  resolveChannelValue,
  schemaType,
  humanize,
  pathKey,
  isSensitivePath,
} from "@/lib/config-schema";
import { analyzeConfigSchema } from "@/lib/config-schema-analyze";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ConfigUiHints = Record<
  string,
  { label?: string; help?: string; sensitive?: boolean; placeholder?: string }
>;

function getLabel(
  path: (string | number)[],
  schema: JsonSchema,
  hints: ConfigUiHints,
): string {
  const key = pathKey(path);
  const hint = hints[key];
  if (hint?.label) return hint.label;
  if (schema.title) return schema.title;
  const last = path.at(-1);
  return humanize(String(last ?? ""));
}

function getHelp(path: (string | number)[], schema: JsonSchema, hints: ConfigUiHints): string | undefined {
  const key = pathKey(path);
  const hint = hints[key];
  if (hint?.help) return hint.help;
  return schema.description;
}

function ConfigField({
  schema,
  value,
  path,
  hints,
  disabled,
  onPatch,
}: {
  schema: JsonSchema;
  value: unknown;
  path: (string | number)[];
  hints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: (string | number)[], value: unknown) => void;
}) {
  const type = schemaType(schema);
  const label = getLabel(path, schema, hints);
  const help = getHelp(path, schema, hints);
  const sensitive = hints[pathKey(path)]?.sensitive ?? isSensitivePath(path);

  if (schema.enum && schema.enum.length > 0) {
    const options = schema.enum;
    const current = value ?? schema.default;
    const currentIdx = options.findIndex(
      (opt) => opt === current || String(opt) === String(current),
    );
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-muted-foreground">{label}</label>
        )}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        <select
          disabled={disabled}
          value={currentIdx >= 0 ? String(currentIdx) : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onPatch(path, undefined);
              return;
            }
            const idx = Number(v);
            if (Number.isNaN(idx) || idx < 0 || idx >= options.length) return;
            onPatch(path, options[idx]);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">请选择…</option>
          {options.map((opt, idx) => (
            <option key={idx} value={String(idx)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "boolean") {
    const checked = typeof value === "boolean" ? value : schema.default === true;
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          {label && (
            <label className="text-sm font-medium text-muted-foreground">{label}</label>
          )}
          {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onPatch(path, !checked)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
              checked ? "translate-x-5" : "translate-x-1",
            )}
          />
        </button>
      </div>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-muted-foreground">{label}</label>
        )}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          placeholder={schema.default !== undefined ? `默认：${schema.default}` : ""}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === "") {
              onPatch(path, undefined);
              return;
            }
            const parsed = Number(raw);
            onPatch(path, Number.isNaN(parsed) ? raw : parsed);
          }}
        />
      </div>
    );
  }

  if (type === "object" && schema.properties) {
    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const entries = Object.entries(schema.properties).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    return (
      <div className="space-y-4 rounded-lg border border-border p-4">
        {label && (
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
        )}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        <div className="space-y-4">
          {entries.map(([propKey, node]) => (
            <ConfigField
              key={propKey}
              schema={node}
              value={obj[propKey]}
              path={[...path, propKey]}
              hints={hints}
              disabled={disabled}
              onPatch={onPatch}
            />
          ))}
        </div>
      </div>
    );
  }

  // string or fallback
  const str = value == null ? "" : String(value);
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
      )}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <Input
        type={sensitive ? "password" : "text"}
        value={str}
        placeholder={
          sensitive ? "••••" : schema.default !== undefined ? `默认：${schema.default}` : ""
        }
        disabled={disabled}
        onChange={(e) => onPatch(path, e.target.value)}
      />
    </div>
  );
}

export function ChannelConfigForm({
  channelId,
  configForm,
  schema,
  uiHints,
  disabled,
  onPatch,
}: {
  channelId: string;
  configForm: Record<string, unknown> | null;
  schema: unknown;
  uiHints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: (string | number)[], value: unknown) => void;
}) {
  try {
    const analysis = analyzeConfigSchema(schema);
    const root = analysis.schema;
    const node = root ? resolveSchemaNode(root, ["channels", channelId]) : null;
    const configValue = configForm ?? {};
    const value = resolveChannelValue(configValue, channelId);

    if (!root) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          配置结构不可用，请使用配置页原始编辑。
        </div>
      );
    }

    if (!node) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          渠道配置结构不可用。
        </div>
      );
    }

    const type = schemaType(node);
    if (type !== "object" || !node.properties) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          配置结构不可用，请使用配置页原始编辑。
        </div>
      );
    }

    const props = node.properties;
    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const entries = Object.entries(props)
      .filter(([, subSchema]) => subSchema && typeof subSchema === "object")
      .sort((a, b) => a[0].localeCompare(b[0]));

    return (
      <div className="space-y-4">
        {entries.map(([propKey, subSchema]) => (
          <ConfigField
            key={propKey}
            schema={subSchema as JsonSchema}
            value={obj[propKey]}
            path={["channels", channelId, propKey]}
            hints={uiHints}
            disabled={disabled}
            onPatch={onPatch}
          />
        ))}
      </div>
    );
  } catch (err) {
    console.error("ChannelConfigForm error:", err);
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        配置结构不可用，请使用配置页原始编辑。若问题持续，请查看控制台。
      </div>
    );
  }
}
