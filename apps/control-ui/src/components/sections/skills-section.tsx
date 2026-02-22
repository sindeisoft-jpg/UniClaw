"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Match backend SkillStatusReport / SkillStatusEntry (skills-status.ts)
type SkillInstallOption = {
  id: string;
  kind: string;
  label: string;
  bins: string[];
};

type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  missing: {
    bins: string[];
    anyBins?: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  install: SkillInstallOption[];
};

type SkillStatusReport = {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills: SkillStatusEntry[];
};

type SkillGroup = { id: string; label: string; skills: SkillStatusEntry[] };

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: "工作区技能", sources: ["openclaw-workspace"] },
  { id: "built-in", label: "内置技能", sources: ["openclaw-bundled"] },
  { id: "installed", label: "已安装技能", sources: ["openclaw-managed"] },
  { id: "extra", label: "扩展技能", sources: ["openclaw-extra"] },
];

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = SKILL_SOURCE_GROUPS.find((g) => g.id === "built-in");
  const other: SkillGroup = { id: "other", label: "其他技能", skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((g) => g.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map((g) => groups.get(g.id)).filter(
    (g): g is SkillGroup => Boolean(g && g.skills.length > 0),
  );
  if (other.skills.length > 0) ordered.push(other);
  return ordered;
}

function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

type SkillMessage = { kind: "success" | "error"; message: string };

export function SkillsSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState("main");
  const [report, setReport] = useState<SkillStatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, SkillMessage>>({});

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<SkillStatusReport | undefined>("skills.status", {
        ...(agentId.trim() ? { agentId: agentId.trim() } : {}),
      });
      setReport(res ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected, agentId]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  async function toggleSkill(skillKey: string, enabled: boolean) {
    if (!client || !connected) return;
    setBusyKey(skillKey);
    setError(null);
    setMessages((m) => ({ ...m, [skillKey]: undefined! }));
    try {
      await client.request("skills.update", { skillKey, enabled });
      await load();
      setMessages((m) => ({
        ...m,
        [skillKey]: { kind: "success", message: enabled ? "技能已启用" : "技能已关闭" },
      }));
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setMessages((m) => ({ ...m, [skillKey]: { kind: "error", message: msg } }));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveApiKey(skillKey: string) {
    if (!client || !connected) return;
    const apiKey = edits[skillKey] ?? "";
    setBusyKey(skillKey);
    setError(null);
    setMessages((m) => ({ ...m, [skillKey]: undefined! }));
    try {
      await client.request("skills.update", { skillKey, apiKey });
      await load();
      setMessages((m) => ({ ...m, [skillKey]: { kind: "success", message: "API 密钥已保存" } }));
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setMessages((m) => ({ ...m, [skillKey]: { kind: "error", message: msg } }));
    } finally {
      setBusyKey(null);
    }
  }

  async function installSkill(skillKey: string, name: string, installId: string) {
    if (!client || !connected) return;
    setBusyKey(skillKey);
    setError(null);
    setMessages((m) => ({ ...m, [skillKey]: undefined! }));
    try {
      const result = await client.request<{ message?: string }>("skills.install", {
        name,
        installId,
        timeoutMs: 120000,
      });
      await load();
      setMessages((m) => ({
        ...m,
        [skillKey]: { kind: "success", message: result?.message ?? "已安装" },
      }));
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setMessages((m) => ({ ...m, [skillKey]: { kind: "error", message: msg } }));
    } finally {
      setBusyKey(null);
    }
  }

  if (!connected) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        请先连接网关后在概览中配置连接。
      </p>
    );
  }

  const skills = report?.skills ?? [];
  const filterLower = filter.trim().toLowerCase();
  const filtered = filterLower
    ? skills.filter((s) =>
        [s.name, s.description, s.source].join(" ").toLowerCase().includes(filterLower),
      )
    : skills;
  const groups = groupSkills(filtered);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>技能</CardTitle>
            <CardDescription>内置、已管理及工作区技能。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">
              智能体 ID
              <Input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="ml-2 inline-block h-8 w-32"
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "加载中…" : "刷新"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-1 items-center gap-2">
            <Input
              placeholder="搜索技能"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs"
            />
            <span className="text-sm text-muted-foreground">显示 {filtered.length} 项</span>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">未找到技能。</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
                return (
                  <details
                    key={group.id}
                    className="group rounded-lg border border-border"
                    open={!collapsedByDefault}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                      <span>{group.label}</span>
                      <span className="text-muted-foreground">{group.skills.length}</span>
                    </summary>
                    <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-1 md:grid-cols-2">
                      {group.skills.map((skill) => {
                        const busy = busyKey === skill.skillKey;
                        const apiKey = edits[skill.skillKey] ?? "";
                        const message = messages[skill.skillKey];
                        const missing = [
                          ...(skill.missing.bins ?? []).map((b) => `bin:${b}`),
                          ...(skill.missing.anyBins ?? []).map((b) => `bin:${b}`),
                          ...(skill.missing.env ?? []).map((e) => `env:${e}`),
                          ...(skill.missing.config ?? []).map((c) => `config:${c}`),
                          ...(skill.missing.os ?? []).map((o) => `os:${o}`),
                        ];
                        const reasons: string[] = [];
                        if (skill.disabled) reasons.push("已禁用");
                        if (skill.blockedByAllowlist) reasons.push("被允许列表拦截");
                        const showBundled = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
                        const canInstall =
                          skill.install.length > 0 &&
                          (skill.missing.bins?.length ?? 0) + (skill.missing.anyBins?.length ?? 0) > 0;

                        return (
                          <Card key={skill.skillKey} className="overflow-hidden">
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="font-medium">
                                  {skill.emoji ? `${skill.emoji} ` : ""}
                                  {skill.name}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {clampText(skill.description, 140)}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                                    {skill.source}
                                  </span>
                                  {showBundled && (
                                    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                                      内置
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${skill.eligible ? "border-green-500/50 text-green-700 dark:text-green-400" : "border-amber-500/50 text-amber-700 dark:text-amber-400"}`}
                                  >
                                    {skill.eligible ? "可用" : "已拦截"}
                                  </span>
                                  {skill.disabled && (
                                    <span className="inline-flex items-center rounded-md border border-amber-500/50 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                                      已禁用
                                    </span>
                                  )}
                                </div>
                                {missing.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    缺失：{missing.join("、")}
                                  </p>
                                )}
                                {reasons.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    原因：{reasons.join("、")}
                                  </p>
                                )}
                              </div>

                              <div className="mt-3 flex flex-wrap items-end justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => toggleSkill(skill.skillKey, skill.disabled)}
                                >
                                  {skill.disabled ? "启用" : "禁用"}
                                </Button>
                                {canInstall && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                      installSkill(
                                        skill.skillKey,
                                        skill.name,
                                        skill.install[0].id,
                                      )
                                    }
                                  >
                                    {busy ? "安装中…" : skill.install[0].label}
                                  </Button>
                                )}
                              </div>

                              {message && (
                                <p
                                  className={`mt-2 text-xs ${message.kind === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"}`}
                                >
                                  {message.message}
                                </p>
                              )}

                              {skill.primaryEnv && (
                                <div className="mt-3 space-y-2">
                                  <label className="text-xs text-muted-foreground">
                                    API 密钥
                                    <Input
                                      type="password"
                                      className="mt-1"
                                      value={apiKey}
                                      onChange={(e) =>
                                        setEdits((prev) => ({
                                          ...prev,
                                          [skill.skillKey]: e.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => saveApiKey(skill.skillKey)}
                                  >
                                    保存密钥
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
