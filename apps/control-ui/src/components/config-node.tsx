"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  hintForPath,
  humanize,
  schemaType,
  defaultSchemaValue,
  isAnySchema,
  type JsonSchema,
  type ConfigUiHints,
} from "@/lib/config-form-utils";

export type ConfigNodeProps = {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  disabled?: boolean;
  showLabel?: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

function isObjectSchema(schema: JsonSchema): boolean {
  const t = schemaType(schema);
  return t === "object" || Boolean(schema.properties || schema.additionalProperties);
}

/** Recursive schema-driven form node (aligned with ui-legacy renderNode). */
export function ConfigNode(props: ConfigNodeProps) {
  const { schema, value, path, hints, disabled = false, onPatch } = props;
  const showLabel = props.showLabel ?? true;
  const type = schemaType(schema);
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path[path.length - 1] ?? ""));
  const help = hint?.help ?? schema.description;

  // anyOf/oneOf: use first non-null variant if only one
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants?.length) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (Array.isArray(v.type) && v.type.includes("null"))),
    );
    if (nonNull.length === 1) {
      return (
        <ConfigNode
          {...props}
          schema={nonNull[0]}
          path={path}
        />
      );
    }
  }

  // Enum: select or segmented (buttons if <= 5)
  if (schema.enum?.length) {
    const options = schema.enum;
    const resolved = value ?? schema.default;
    if (options.length <= 5) {
      return (
        <div className="space-y-1.5">
          {showLabel && (
            <>
              <label className="text-sm font-medium">{label}</label>
              {help && <p className="text-xs text-muted-foreground">{help}</p>}
            </>
          )}
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                disabled={disabled}
                onClick={() => onPatch(path, opt)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  opt === resolved || String(opt) === String(resolved)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {String(opt)}
              </button>
            ))}
          </div>
        </div>
      );
    }
    const currentIndex = options.findIndex(
      (opt) => opt === resolved || String(opt) === String(resolved),
    );
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <>
            <label className="text-sm font-medium">{label}</label>
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
          </>
        )}
        <select
          disabled={disabled}
          value={currentIndex >= 0 ? currentIndex : ""}
          onChange={(e) => {
            const v = e.target.value;
            onPatch(path, v === "" ? undefined : options[Number(v)]);
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">请选择…</option>
          {options.map((opt, idx) => (
            <option key={String(opt)} value={idx}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Object: recursive fields + optional additionalProperties (map: 添加项 / 移除)
  if (type === "object" || isObjectSchema(schema)) {
    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const propsSchema = schema.properties ?? {};
    const entries = Object.entries(propsSchema).sort((a, b) => {
      const oa = hintForPath([...path, a[0]], hints)?.order ?? 0;
      const ob = hintForPath([...path, b[0]], hints)?.order ?? 0;
      if (oa !== ob) return oa - ob;
      return a[0].localeCompare(b[0]);
    });

    const additional = schema.additionalProperties;
    const allowExtra = Boolean(additional) && typeof additional === "object";
    const reservedKeys = new Set(Object.keys(propsSchema));
    const extraEntries = Object.entries(obj).filter(([k]) => !reservedKeys.has(k));

    const mapFieldSchema = allowExtra ? (additional as JsonSchema) : null;
    const anySchema = mapFieldSchema ? isAnySchema(mapFieldSchema) : false;

    const content = (
      <div className="space-y-4">
        {entries.map(([propKey, node]) => (
          <ConfigNode
            key={propKey}
            schema={node}
            value={obj[propKey]}
            path={[...path, propKey]}
            hints={hints}
            disabled={disabled}
            showLabel={true}
            onPatch={onPatch}
          />
        ))}
        {allowExtra && mapFieldSchema && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">自定义项</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  let key = "custom-1";
                  let i = 1;
                  while (key in obj) {
                    i += 1;
                    key = `custom-${i}`;
                  }
                  const next = { ...obj };
                  next[key] = anySchema ? {} : defaultSchemaValue(mapFieldSchema);
                  onPatch(path, next);
                }}
                className="rounded border border-input bg-background px-2 py-1.5 text-xs hover:bg-accent"
              >
                添加项
              </button>
            </div>
            {extraEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无自定义项，点击「添加项」创建。</p>
            ) : (
              <div className="space-y-2">
                {extraEntries.map(([key, entryValue]) => (
                  <div
                    key={key}
                    className="flex flex-wrap items-start gap-2 rounded border border-border bg-muted/30 p-2"
                  >
                    <Input
                      type="text"
                      placeholder="键名"
                      value={key}
                      disabled={disabled}
                      onChange={(e) => {
                        const nextKey = e.target.value.trim();
                        if (!nextKey || nextKey === key) return;
                        const next = { ...obj };
                        if (nextKey in next) return;
                        next[nextKey] = next[key];
                        delete next[key];
                        onPatch(path, next);
                      }}
                      className="h-8 w-32 font-mono text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      {anySchema ? (
                        <textarea
                          placeholder="JSON 值"
                          rows={2}
                          value={
                            typeof entryValue === "undefined"
                              ? ""
                              : JSON.stringify(entryValue, null, 2)
                          }
                          disabled={disabled}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) {
                              onPatch([...path, key], undefined);
                              return;
                            }
                            try {
                              onPatch([...path, key], JSON.parse(raw));
                            } catch {
                              // keep previous on parse error
                            }
                          }}
                          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                        />
                      ) : (
                        <ConfigNode
                          schema={mapFieldSchema}
                          value={entryValue}
                          path={[...path, key]}
                          hints={hints}
                          disabled={disabled}
                          showLabel={false}
                          onPatch={onPatch}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const next = { ...obj };
                        delete next[key];
                        onPatch(path, next);
                      }}
                      className="shrink-0 rounded border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      title="移除该项"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );

    if (path.length <= 1) {
      return content;
    }
    return (
      <details className="rounded-md border border-border" open>
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
          {label}
        </summary>
        {help && <p className="px-3 pb-2 text-xs text-muted-foreground">{help}</p>}
        <div className="border-t border-border px-3 pb-3 pt-2">{content}</div>
      </details>
    );
  }

  // Array
  if (type === "array") {
    const itemsSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    if (!itemsSchema) {
      return (
        <div className="text-sm text-destructive">
          <span className="font-medium">{label}</span>
          <p>不支持的数组结构，请使用原始模式。</p>
        </div>
      );
    }
    const arr = Array.isArray(value) ? value : Array.isArray(schema.default) ? schema.default : [];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {showLabel && <span className="text-sm font-medium">{label}</span>}
          <span className="text-xs text-muted-foreground">{arr.length} 项</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPatch(path, [...arr, defaultSchemaValue(itemsSchema)])}
            className="rounded border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            添加
          </button>
        </div>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        {arr.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无项，点击「添加」创建。</p>
        ) : (
          <div className="space-y-3">
            {arr.map((item, idx) => (
              <Card key={idx} className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const next = [...arr];
                      next.splice(idx, 1);
                      onPatch(path, next);
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    移除
                  </button>
                </div>
                <ConfigNode
                  schema={itemsSchema}
                  value={item}
                  path={[...path, idx]}
                  hints={hints}
                  disabled={disabled}
                  showLabel={false}
                  onPatch={onPatch}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Boolean
  if (type === "boolean") {
    const checked =
      typeof value === "boolean"
        ? value
        : typeof schema.default === "boolean"
          ? schema.default
          : false;
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <>
            <label className="text-sm font-medium">{label}</label>
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
          </>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onPatch(path, e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">{checked ? "是" : "否"}</span>
        </label>
      </div>
    );
  }

  // Number / integer
  if (type === "number" || type === "integer") {
    const numVal = value ?? schema.default ?? "";
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <>
            <label className="text-sm font-medium">{label}</label>
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
          </>
        )}
        <Input
          type="number"
          value={numVal === undefined || numVal === null ? "" : String(numVal)}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onPatch(path, v === "" ? undefined : Number(v));
          }}
        />
      </div>
    );
  }

  // String (default)
  if (type === "string" || type === undefined) {
    const strVal = value ?? schema.default ?? "";
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <>
            <label className="text-sm font-medium">{label}</label>
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
          </>
        )}
        <Input
          type="text"
          value={strVal === undefined || strVal === null ? "" : String(strVal)}
          disabled={disabled}
          onChange={(e) => onPatch(path, e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground">
      <span className="font-medium">{label}</span>
      <p>不支持的类型：{type}。请使用原始模式。</p>
    </div>
  );
}
