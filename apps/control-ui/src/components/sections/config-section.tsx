"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  RefreshCw,
  AlertCircle,
  Save,
  Search,
  Settings,
  ChevronDown,
} from "lucide-react";
import { ConfigNode } from "@/components/config-node";
import {
  cloneConfigObject,
  serializeConfigForm,
  setPathValue,
  hintForPath,
  humanize,
  schemaType,
  type JsonSchema,
  type ConfigUiHints,
} from "@/lib/config-form-utils";

type ConfigSnapshot = {
  config?: Record<string, unknown>;
  raw?: string | null;
  valid?: boolean;
  issues?: unknown[];
  hash?: string;
};

type ConfigSchemaResponse = {
  schema?: unknown;
  uiHints?: ConfigUiHints;
  version?: string;
};

// Section metadata: align with ui-legacy config-form.render SECTION_META so every nav item has a proper label/description.
const SECTION_META: Record<string, { label: string; description: string }> = {
  env: { label: "环境变量", description: "传入网关进程的环境变量" },
  update: { label: "更新", description: "自动更新与发布渠道" },
  agents: { label: "智能体", description: "智能体配置、模型与身份" },
  auth: { label: "认证", description: "API 密钥与认证配置" },
  channels: { label: "渠道", description: "消息渠道（Telegram、Discord、Slack 等）" },
  messages: { label: "消息", description: "消息处理与路由设置" },
  commands: { label: "命令", description: "自定义斜杠命令" },
  hooks: { label: "钩子", description: "Webhook 与事件钩子" },
  skills: { label: "技能", description: "技能包与能力" },
  tools: { label: "工具", description: "工具配置（浏览器、搜索等）" },
  gateway: { label: "网关", description: "网关服务设置（端口、认证、绑定）" },
  wizard: { label: "设置向导", description: "设置向导状态与历史" },
  meta: { label: "元数据", description: "网关元数据与版本信息" },
  logging: { label: "日志", description: "日志级别与输出配置" },
  diagnostics: { label: "诊断", description: "诊断与调试选项" },
  browser: { label: "浏览器", description: "浏览器自动化设置" },
  ui: { label: "界面", description: "用户界面偏好" },
  models: { label: "模型", description: "AI 模型配置与提供商" },
  nodeHost: { label: "节点主机", description: "节点与浏览器代理设置" },
  bindings: { label: "快捷键", description: "按键绑定与快捷方式" },
  broadcast: { label: "广播", description: "广播与通知设置" },
  audio: { label: "音频", description: "音频输入/输出设置" },
  media: { label: "媒体", description: "媒体文件与附件设置" },
  session: { label: "会话", description: "会话管理与持久化" },
  cron: { label: "定时任务", description: "计划任务与自动化" },
  web: { label: "Web", description: "Web 服务与 API 设置" },
  discovery: { label: "发现", description: "服务发现与网络" },
  canvasHost: { label: "画布主机", description: "画布渲染与显示" },
  talk: { label: "通话", description: "语音与通话设置" },
  plugins: { label: "插件", description: "插件管理与扩展" },
  approvals: { label: "审批", description: "执行审批与确认" },
};

const SECTIONS_ORDER = [
  "env",
  "update",
  "agents",
  "auth",
  "channels",
  "messages",
  "commands",
  "hooks",
  "skills",
  "tools",
  "gateway",
  "wizard",
  "meta",
  "logging",
  "diagnostics",
  "browser",
  "ui",
  "models",
  "nodeHost",
  "bindings",
  "broadcast",
  "audio",
  "media",
  "session",
  "cron",
  "web",
  "discovery",
  "canvasHost",
  "talk",
  "plugins",
  "approvals",
];

function computeDiff(
  original: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): Array<{ path: string; from: unknown; to: unknown }> {
  if (!original || !current) return [];
  const changes: Array<{ path: string; from: unknown; to: unknown }> = [];
  function compare(orig: unknown, curr: unknown, path: string) {
    if (orig === curr) return;
    if (typeof orig !== typeof curr) {
      changes.push({ path, from: orig, to: curr });
      return;
    }
    if (typeof orig !== "object" || orig === null || curr === null) {
      if (orig !== curr) changes.push({ path, from: orig, to: curr });
      return;
    }
    if (Array.isArray(orig) && Array.isArray(curr)) {
      if (JSON.stringify(orig) !== JSON.stringify(curr)) changes.push({ path, from: orig, to: curr });
      return;
    }
    const o = orig as Record<string, unknown>;
    const c = curr as Record<string, unknown>;
    const keys = new Set([...Object.keys(o), ...Object.keys(c)]);
    for (const k of keys) {
      compare(o[k], c[k], path ? `${path}.${k}` : k);
    }
  }
  compare(original, current, "");
  return changes;
}

function truncateVal(v: unknown, max = 40): string {
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

function getSectionLabel(key: string, schema?: JsonSchema): string {
  return SECTION_META[key]?.label ?? schema?.title ?? humanize(key);
}

const ALL_SUBSECTION = "__all__";

type SubsectionEntry = { key: string; label: string; description?: string; order: number };

function resolveSubsections(
  sectionKey: string,
  sectionSchema: JsonSchema | undefined,
  uiHints: ConfigUiHints,
): SubsectionEntry[] {
  if (!sectionSchema || schemaType(sectionSchema) !== "object" || !sectionSchema.properties) {
    return [];
  }
  const entries: SubsectionEntry[] = Object.entries(sectionSchema.properties).map(
    ([subKey, node]) => {
      const hint = hintForPath([sectionKey, subKey], uiHints);
      return {
        key: subKey,
        label: hint?.label ?? node.title ?? humanize(subKey),
        description: hint?.help ?? node.description ?? "",
        order: hint?.order ?? 50,
      };
    },
  );
  entries.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.key.localeCompare(b.key)));
  return entries;
}

export function ConfigSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [raw, setRaw] = useState("");
  const [originalRaw, setOriginalRaw] = useState("");
  const [formValue, setFormValue] = useState<Record<string, unknown> | null>(null);
  const [originalValue, setOriginalValue] = useState<Record<string, unknown> | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<unknown[]>([]);
  const [hash, setHash] = useState<string | null>(null);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [uiHints, setUiHints] = useState<ConfigUiHints>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"form" | "raw">("form");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeSubsection, setActiveSubsection] = useState<string | null>(null);
  const [applySessionKey, setApplySessionKey] = useState("main");
  const [formDirty, setFormDirty] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  const loadConfig = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<ConfigSnapshot>("config.get", {});
      const cfg = res?.config ?? null;
      const rawStr =
        typeof res?.raw === "string" ? res.raw : cfg != null ? serializeConfigForm(cfg) : "{}";
      setConfig(cfg);
      setRaw(rawStr);
      setOriginalRaw(rawStr);
      setValid(res?.valid ?? null);
      setIssues(Array.isArray(res?.issues) ? res.issues : []);
      setHash(res?.hash ?? null);
      if (!formDirty) {
        setFormValue(cfg != null ? cloneConfigObject(cfg) : null);
        setOriginalValue(cfg != null ? cloneConfigObject(cfg) : null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected, formDirty]);

  const loadSchema = useCallback(async () => {
    if (!client || !connected) return;
    setSchemaLoading(true);
    setError(null);
    try {
      const res = await client.request<ConfigSchemaResponse>("config.schema", {});
      const s = res?.schema;
      setSchema(s && typeof s === "object" && !Array.isArray(s) ? (s as JsonSchema) : null);
      setUiHints((res?.uiHints ?? {}) as ConfigUiHints);
    } catch (e) {
      setError(String(e));
    } finally {
      setSchemaLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) {
      void loadConfig();
      void loadSchema();
    }
  }, [connected, loadConfig, loadSchema]);

  // Scroll main content into view when section or form mode changes so the selected section is visible.
  useEffect(() => {
    if (formMode === "form" && mainContentRef.current) {
      mainContentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeSection, formMode]);

  const handleFormPatch = useCallback((path: Array<string | number>, value: unknown) => {
    setFormValue((prev) => {
      const base = cloneConfigObject(prev ?? config ?? {});
      setPathValue(base, path, value);
      return base;
    });
    setFormDirty(true);
  }, [config]);

  const serializeForSubmit = useCallback((): string => {
    if (formMode === "raw") return raw;
    return formValue != null ? serializeConfigForm(formValue) : raw;
  }, [formMode, formValue, raw]);

  const handleSave = useCallback(async () => {
    if (!client || !connected || saving || !hash) return;
    const rawToSend = formMode === "raw" ? raw : (formValue != null ? serializeConfigForm(formValue) : raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawToSend);
    } catch {
      setError("JSON 格式无效");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await client.request("config.set", { raw: JSON.stringify(parsed), baseHash: hash });
      setFormDirty(false);
      await loadConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [client, connected, saving, hash, formMode, formValue, raw, loadConfig]);

  const handleApply = useCallback(async () => {
    if (!client || !connected || applying || !hash) return;
    const rawToSend = serializeForSubmit();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawToSend);
    } catch {
      setError("JSON 格式无效");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await client.request("config.apply", {
        raw: JSON.stringify(parsed),
        baseHash: hash,
        sessionKey: applySessionKey.trim() || undefined,
      });
      setFormDirty(false);
      await loadConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }, [client, connected, applying, hash, applySessionKey, serializeForSubmit, loadConfig]);

  const handleUpdate = useCallback(async () => {
    if (!client || !connected || updating) return;
    setUpdating(true);
    setError(null);
    try {
      await client.request("update.run", {
        sessionKey: applySessionKey.trim() || undefined,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setUpdating(false);
    }
  }, [client, connected, updating, applySessionKey]);

  if (!connected) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium">未连接网关</h3>
        <p className="mt-2 text-sm text-muted-foreground">请先连接网关后在概览中配置连接。</p>
      </div>
    );
  }

  const rootSchema = schema && schemaType(schema) === "object" ? schema : null;
  const rootProps: Record<string, JsonSchema> | undefined = rootSchema?.properties;
  const sectionKeys = (() => {
    if (!rootProps) return [];
    return SECTIONS_ORDER.filter((k) => k in rootProps).concat(
      Object.keys(rootProps).filter((k) => !SECTIONS_ORDER.includes(k)),
    );
  })();
  const searchLower = searchQuery.trim().toLowerCase();
  const filteredSections = searchLower
    ? sectionKeys.filter((k) => {
        const meta = SECTION_META[k];
        const label = getSectionLabel(k, rootProps?.[k]);
        return (
          k.toLowerCase().includes(searchLower) ||
          label.toLowerCase().includes(searchLower) ||
          meta?.description.toLowerCase().includes(searchLower)
        );
      })
    : sectionKeys;

  const diff = formMode === "form" ? computeDiff(originalValue, formValue) : [];
  const hasRawChanges = formMode === "raw" && raw !== originalRaw;
  const hasChanges = formMode === "form" ? diff.length > 0 : hasRawChanges;
  const canSave = connected && !saving && hasChanges && hash != null;
  const canApply = connected && !applying && !updating && hasChanges && hash != null;
  const validityLabel = valid == null ? "未知" : valid ? "有效" : "无效";

  return (
    <div className="config-layout flex gap-6">
      {/* Sidebar */}
      <aside className="config-sidebar flex w-56 shrink-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">设置</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              valid === true
                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                : valid === false
                  ? "bg-destructive/20 text-destructive"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {validityLabel}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索设置…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <nav className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveSection(null);
              setActiveSubsection(null);
              setFormMode("form");
            }}
            className={`rounded-md px-3 py-2 text-left text-sm ${activeSection === null ? "bg-accent" : "hover:bg-accent/50"}`}
          >
            全部设置
          </button>
          {filteredSections.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveSection(key);
                setActiveSubsection(null);
                setFormMode("form");
              }}
              className={`rounded-md px-3 py-2 text-left text-sm ${activeSection === key ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              {getSectionLabel(key, rootProps?.[key])}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex gap-1 rounded-md border border-border p-1">
          <button
            type="button"
            onClick={() => setFormMode("form")}
            disabled={schemaLoading || !schema}
            className={`flex-1 rounded px-2 py-1.5 text-xs ${formMode === "form" ? "bg-accent" : ""}`}
          >
            表单
          </button>
          <button
            type="button"
            onClick={() => setFormMode("raw")}
            className={`flex-1 rounded px-2 py-1.5 text-xs ${formMode === "raw" ? "bg-accent" : ""}`}
          >
            原始
          </button>
        </div>
      </aside>

      {/* Main */}
      <main ref={mainContentRef} className="config-main min-w-0 flex-1 space-y-4" tabIndex={-1}>
        {/* Action bar: sticky so 保存/应用 always visible when scrolling */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-sm text-muted-foreground">
            {hasChanges
              ? formMode === "raw"
                ? "未保存的更改"
                : `${diff.length} 处未保存更改`
              : "无更改"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              应用会话
              <Input
                type="text"
                value={applySessionKey}
                onChange={(e) => setApplySessionKey(e.target.value)}
                className="h-8 w-28"
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => void loadConfig()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "加载中…" : "重新加载"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleApply} disabled={!canApply}>
              {applying ? "应用中…" : "应用"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleUpdate} disabled={!connected || updating}>
              {updating ? "更新中…" : "更新"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          </div>
        )}

        {/* Diff panel */}
        {hasChanges && formMode === "form" && diff.length > 0 && (
          <details className="rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span>查看 {diff.length} 处待应用更改</span>
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="border-t border-border px-4 py-3">
              {diff.map((c) => (
                <div key={c.path} className="mb-2 text-sm">
                  <div className="font-mono text-muted-foreground">{c.path}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{truncateVal(c.from)}</span>
                    <span>→</span>
                    <span>{truncateVal(c.to)}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Section hero (form mode, section selected) */}
        {formMode === "form" && activeSection && (
          <Card className="p-4">
            <h3 className="font-medium">
              {SECTION_META[activeSection]?.label ??
                getSectionLabel(activeSection, rootProps?.[activeSection])}
            </h3>
            {(SECTION_META[activeSection]?.description ??
              (rootProps?.[activeSection] as JsonSchema | undefined)?.description) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {SECTION_META[activeSection]?.description ??
                  (rootProps?.[activeSection] as JsonSchema | undefined)?.description}
              </p>
            )}
          </Card>
        )}

        {/* Content */}
        {formMode === "form" ? (
          schemaLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              加载配置结构…
            </div>
          ) : rootProps ? (
            (() => {
              const sectionsToRender: Array<[string, JsonSchema]> = activeSection
                ? rootProps[activeSection] != null
                  ? [[activeSection, rootProps[activeSection]!]]
                  : []
                : filteredSections.map((k) => [k, rootProps[k]]);
              return (
                <div className="space-y-4">
                  {sectionsToRender.length === 0 && activeSection ? (
                    <Card className="p-4">
                      <h3 className="font-medium">
                        {getSectionLabel(activeSection, rootProps[activeSection])}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        该配置区块在当前配置结构中不可用，请使用原始模式编辑。
                      </p>
                    </Card>
                  ) : null}
                  {sectionsToRender.map(([key, sectionSchema]) => {
                    const sk = key as string;
                    const ss = sectionSchema as JsonSchema;
                    const value = formValue?.[sk];
                    const meta = SECTION_META[sk] ?? {
                      label: getSectionLabel(sk, ss),
                      description: ss?.description ?? "",
                    };
                    const subsections = resolveSubsections(sk, ss, uiHints);
                    const showSubnav =
                      sectionsToRender.length === 1 &&
                      subsections.length > 0 &&
                      !searchQuery.trim();
                    const effectiveSubsection =
                      showSubnav && activeSubsection !== null && activeSubsection !== ALL_SUBSECTION
                        ? activeSubsection
                        : null;

                    if (!ss || schemaType(ss) !== "object") {
                      return (
                        <Card key={sk} className="p-4">
                          <h3 className="font-medium">{meta.label}</h3>
                          <p className="mt-2 text-sm text-muted-foreground">
                            不支持的配置节点，请使用原始模式。
                          </p>
                        </Card>
                      );
                    }

                    return (
                      <Card key={sk} className="p-4">
                        <div className="mb-3">
                          <h3 className="font-medium">{meta.label}</h3>
                          {meta.description && (
                            <p className="text-sm text-muted-foreground">{meta.description}</p>
                          )}
                        </div>
                        {showSubnav && (
                          <div className="mb-4 flex flex-wrap gap-1 rounded-md border border-border p-1">
                            <button
                              type="button"
                              onClick={() => setActiveSubsection(ALL_SUBSECTION)}
                              className={`rounded px-2 py-1.5 text-xs ${
                                activeSubsection === null ||
                                activeSubsection === ALL_SUBSECTION
                                  ? "bg-accent"
                                  : "hover:bg-accent/50"
                              }`}
                            >
                              全部
                            </button>
                            {subsections.map((sub) => (
                              <button
                                key={sub.key}
                                type="button"
                                onClick={() => setActiveSubsection(sub.key)}
                                title={sub.description}
                                className={`rounded px-2 py-1.5 text-xs ${
                                  activeSubsection === sub.key ? "bg-accent" : "hover:bg-accent/50"
                                }`}
                              >
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="space-y-4">
                          {effectiveSubsection != null &&
                          ss.properties?.[effectiveSubsection] != null ? (
                            <ConfigNode
                              schema={ss.properties[effectiveSubsection]!}
                              value={
                                value && typeof value === "object" && !Array.isArray(value)
                                  ? (value as Record<string, unknown>)[effectiveSubsection]
                                  : undefined
                              }
                              path={[sk, effectiveSubsection]}
                              hints={uiHints}
                              disabled={loading}
                              showLabel={false}
                              onPatch={handleFormPatch}
                            />
                          ) : (
                            <ConfigNode
                              schema={ss}
                              value={value}
                              path={[sk]}
                              hints={uiHints}
                              disabled={loading}
                              showLabel={false}
                              onPatch={handleFormPatch}
                            />
                          )}
                        </div>
                      </Card>
                    );
                  })}
                  {filteredSections.length === 0 && (
                    <p className="py-4 text-sm text-muted-foreground">
                      {searchQuery ? `没有匹配「${searchQuery}」的配置项` : "本区块无配置项"}
                    </p>
                  )}
                  <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
                    修改后请点击上方「保存」或「应用」使配置生效。
                  </p>
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground">配置结构不可用，请使用原始模式。</p>
          )
        ) : (
          <div className="space-y-4">
            <label className="text-sm text-muted-foreground">原始 JSON5</label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="h-96 w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {hash != null ? `配置哈希: ${hash.slice(0, 8)}...` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const p = JSON.parse(raw);
                      setRaw(JSON.stringify(p, null, 2));
                    } catch {
                      setError("JSON 格式无效，无法格式化");
                    }
                  }}
                >
                  格式化
                </Button>
              </div>
            </div>
          </div>
        )}

        {issues.length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <pre className="overflow-auto text-sm">{JSON.stringify(issues, null, 2)}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
