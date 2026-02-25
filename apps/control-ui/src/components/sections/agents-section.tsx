"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

type AgentEntry = {
  id: string;
  name?: string | null;
  identity?: { name?: string; avatar?: string; emoji?: string } | null;
};

type AgentsListResult = {
  agents?: AgentEntry[];
  defaultId?: string | null;
  mainKey?: string;
  scope?: string;
};

type AgentPanel = "overview" | "files" | "tools" | "skills" | "channels" | "cron";

type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
};

type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

function defaultWorkspaceFromName(name: string): string {
  const s = name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
  return s ? `agents/${s}` : "agents/new-agent";
}

/** 与网关 normalizeAgentId 一致：名称会转为 id，main 为保留 id。 */
function nameToAgentId(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "main";
  const lower = trimmed.toLowerCase();
  if (/^[a-z0-9][a-z0-9_-]*$/.test(lower)) return lower;
  return (
    lower
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "main"
  );
}

function agentDisplayName(a: AgentEntry): string {
  return (a.name ?? "").trim() || (a.identity?.name ?? "").trim() || a.id;
}

export function AgentsSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentsListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createWorkspace, setCreateWorkspace] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<AgentPanel>("overview");
  const [configForm, setConfigForm] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [agentFilesList, setAgentFilesList] = useState<AgentsFilesListResult | null>(null);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [agentFileActive, setAgentFileActive] = useState<string | null>(null);
  const [agentFileContents, setAgentFileContents] = useState<Record<string, string>>({});
  const [agentFileDrafts, setAgentFileDrafts] = useState<Record<string, string>>({});
  const [agentFileSaving, setAgentFileSaving] = useState(false);
  const agentFilesLoadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<AgentsListResult>("agents.list", {});
      setResult(res ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const agents = result?.agents ?? [];
  const defaultId = result?.defaultId ?? null;
  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId) ?? null
    : null;
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(defaultId ?? agents[0]?.id ?? null);
    }
  }, [agents, defaultId, selectedAgentId]);

  const loadConfig = useCallback(async () => {
    if (!client || !connected) return;
    setConfigLoading(true);
    try {
      const res = await client.request<{ config?: Record<string, unknown> }>("config.get", {});
      setConfigForm(res?.config ?? null);
    } finally {
      setConfigLoading(false);
    }
  }, [client, connected]);

  const loadAgentFiles = useCallback(
    async (agentId: string) => {
      if (!client || !connected) return;
      if (agentFilesLoadingRef.current) return;
      agentFilesLoadingRef.current = true;
      setAgentFilesLoading(true);
      try {
        const res = await client.request<AgentsFilesListResult>("agents.files.list", { agentId });
        setAgentFilesList(res ?? null);
        setAgentFileActive((prev) =>
          prev && res?.files?.some((f) => f.name === prev) ? prev : null,
        );
      } catch {
        setAgentFilesList(null);
      } finally {
        agentFilesLoadingRef.current = false;
        setAgentFilesLoading(false);
      }
    },
    [client, connected],
  );

  const loadFileContent = useCallback(
    async (agentId: string, name: string) => {
      if (!client || !connected) return;
      try {
        const res = await client.request<{
          file?: { content?: string; name?: string };
        }>("agents.files.get", { agentId, name });
        const content = res?.file?.content ?? "";
        setAgentFileContents((prev) => ({ ...prev, [name]: content }));
        setAgentFileDrafts((prev) => ({ ...prev, [name]: content }));
      } catch {
        setAgentFileContents((prev) => ({ ...prev, [name]: "" }));
        setAgentFileDrafts((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [client, connected],
  );

  useEffect(() => {
    if (activePanel === "overview" && selectedAgent && !configForm && !configLoading) {
      void loadConfig();
    }
  }, [activePanel, selectedAgent, configForm, configLoading, loadConfig]);

  useEffect(() => {
    if (activePanel === "files" && selectedAgent?.id) {
      void loadAgentFiles(selectedAgent.id);
    }
  }, [activePanel, selectedAgent?.id, loadAgentFiles]);

  useEffect(() => {
    if (agentFileActive && selectedAgent?.id) {
      void loadFileContent(selectedAgent.id, agentFileActive);
    }
  }, [agentFileActive, selectedAgent?.id, loadFileContent]);

  const saveAgentFile = useCallback(
    async (agentId: string, name: string, content: string) => {
      if (!client || !connected || agentFileSaving) return;
      setAgentFileSaving(true);
      try {
        await client.request("agents.files.set", { agentId, name, content });
        setAgentFileContents((prev) => ({ ...prev, [name]: content }));
        setAgentFileDrafts((prev) => ({ ...prev, [name]: content }));
      } finally {
        setAgentFileSaving(false);
      }
    },
    [client, connected, agentFileSaving],
  );

  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!client || !connected || createBusy) return;
      const name = createName.trim();
      if (!name) {
        setCreateError("请输入名称");
        return;
      }
      const agentId = nameToAgentId(name);
      if (agentId === "main" && !name) {
        setCreateError("不能使用保留 ID「main」，请换一个名称（例如：客服助手、我的智能体）");
        return;
      }
      const workspace = createWorkspace.trim() || defaultWorkspaceFromName(name);
      setCreateBusy(true);
      setCreateError(null);
      try {
        await client.request("agents.create", { name, workspace });
        setCreateOpen(false);
        setCreateName("");
        setCreateWorkspace("");
        void load();
      } catch (err) {
        const msg = String(err);
        setCreateError(
          msg.includes("main") && msg.includes("reserved")
            ? "不能使用保留 ID「main」，请换一个名称。"
            : msg,
        );
      } finally {
        setCreateBusy(false);
      }
    },
    [client, connected, createBusy, createName, createWorkspace, load],
  );

  if (!connected) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        请先连接网关后在概览中配置连接。
      </p>
    );
  }

  const TABS: { id: AgentPanel; label: string }[] = [
    { id: "overview", label: "概览" },
    { id: "files", label: "文件" },
    { id: "tools", label: "工具" },
    { id: "skills", label: "技能" },
    { id: "channels", label: "渠道" },
    { id: "cron", label: "定时任务" },
  ];

  const cfgAgents = (configForm?.agents as { list?: Array<{ id?: string; workspace?: string; name?: string; model?: unknown; skills?: string[] }> })?.list ?? [];
  const selectedConfigEntry = selectedAgent ? cfgAgents.find((e) => e?.id === selectedAgent.id) : null;
  const workspacePath =
    (agentFilesList?.agentId === selectedAgent?.id ? agentFilesList?.workspace : null) ||
    selectedConfigEntry?.workspace ||
    (configForm?.agents as { defaults?: { workspace?: string } })?.defaults?.workspace ||
    "—";
  const modelLabel = selectedConfigEntry?.model
    ? typeof selectedConfigEntry.model === "string"
      ? selectedConfigEntry.model
      : (selectedConfigEntry.model as { primary?: string })?.primary ?? "—"
    : "—";
  const identityName = selectedAgent ? agentDisplayName(selectedAgent) : "—";
  const identityEmoji = selectedAgent?.identity?.emoji?.trim() || "—";
  const isDefault = Boolean(defaultId && selectedAgent && selectedAgent.id === defaultId);
  const skillsLabel = Array.isArray(selectedConfigEntry?.skills)
    ? `已选 ${selectedConfigEntry.skills.length} 项`
    : "全部技能";

  const activeFileEntry =
    agentFileActive && agentFilesList?.agentId === selectedAgent?.id
      ? agentFilesList?.files?.find((f) => f.name === agentFileActive) ?? null
      : null;
  const activeFileDraft = agentFileActive ? agentFileDrafts[agentFileActive] : "";
  const activeFileBase = agentFileActive ? agentFileContents[agentFileActive] : "";
  const fileDirty = activeFileDraft !== activeFileBase;

  return (
    <div className="mt-4 flex flex-col gap-4 md:flex-row md:gap-6">
      {/* 左侧：智能体列表 */}
      <Card className="md:w-64 shrink-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">智能体</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {agents.length} 个已配置
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setCreateOpen(true);
                  setCreateError(null);
                  setCreateName("");
                  setCreateWorkspace("");
                }}
                title="创建智能体"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={load}
                disabled={loading}
              >
                {loading ? "…" : "刷新"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs text-destructive mb-2">
              {error}
            </div>
          )}
          {createOpen && (
            <Card className="mb-3">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">新建智能体</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleCreateSubmit} className="space-y-2">
                  {createError && (
                    <div className="text-xs text-destructive">{createError}</div>
                  )}
                  <div>
                    <label className="text-xs font-medium">名称</label>
                    <Input
                      value={createName}
                      onChange={(e) => {
                        setCreateName(e.target.value);
                        if (!createWorkspace) setCreateWorkspace(defaultWorkspaceFromName(e.target.value));
                      }}
                      placeholder="例如：客服助手"
                      className="h-8 text-sm mt-0.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">工作区路径</label>
                    <Input
                      value={createWorkspace}
                      onChange={(e) => setCreateWorkspace(e.target.value)}
                      placeholder="留空则 agents/名称"
                      className="h-8 text-sm mt-0.5"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button type="submit" size="sm" disabled={createBusy}>
                      {createBusy ? "…" : "创建"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setCreateOpen(false); setCreateError(null); }}
                      disabled={createBusy}
                    >
                      取消
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="space-y-0.5">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">暂无智能体</p>
            ) : (
              agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAgentId(a.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    selectedAgentId === a.id
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                    {a.identity?.emoji?.trim() || agentDisplayName(a).slice(0, 1)}
                  </span>
                  <span className="min-w-0 truncate">{agentDisplayName(a)}</span>
                  {defaultId === a.id && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      默认
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 右侧：选中智能体详情 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selectedAgent ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p className="font-medium">选择智能体</p>
              <p className="text-sm mt-1">选择左侧智能体以查看其工作区、文件与配置。</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-3">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-lg">
                    {selectedAgent.identity?.emoji?.trim() || agentDisplayName(selectedAgent).slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-medium">{agentDisplayName(selectedAgent)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{selectedAgent.id}</p>
                  </div>
                  {isDefault && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">默认</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-1 border-b border-border mb-3 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePanel(tab.id)}
                  className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    activePanel === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activePanel === "overview" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">概览</CardTitle>
                  <p className="text-sm text-muted-foreground">工作区路径与身份元数据</p>
                </CardHeader>
                <CardContent>
                  {configLoading ? (
                    <p className="text-sm text-muted-foreground">加载配置中…</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">工作区</p>
                        <p className="font-mono text-sm break-all">{workspacePath}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">主模型</p>
                        <p className="font-mono text-sm">{modelLabel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">身份名称</p>
                        <p className="text-sm">{identityName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">默认</p>
                        <p className="text-sm">{isDefault ? "是" : "否"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">身份 Emoji</p>
                        <p className="text-sm">{identityEmoji}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">技能筛选</p>
                        <p className="text-sm">{skillsLabel}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-4">
                    模型与工作区等高级设置请在「配置」页中编辑 agents 节点。
                  </p>
                </CardContent>
              </Card>
            )}

            {activePanel === "files" && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">核心文件</CardTitle>
                    <p className="text-sm text-muted-foreground">引导人设、身份与工具说明</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={agentFilesLoading}
                    onClick={() => selectedAgent && loadAgentFiles(selectedAgent.id)}
                  >
                    {agentFilesLoading ? "加载中…" : "刷新"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {agentFilesList?.agentId === selectedAgent.id && (
                    <p className="text-xs text-muted-foreground font-mono mb-3">
                      工作区：{agentFilesList.workspace}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      {(agentFilesList?.files ?? []).map((file) => (
                        <button
                          key={file.name}
                          type="button"
                          onClick={() => setAgentFileActive(file.name)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono flex items-center justify-between ${
                            agentFileActive === file.name ? "bg-primary/15" : "hover:bg-accent"
                          }`}
                        >
                          {file.name}
                          {file.missing && (
                            <span className="text-xs text-amber-600">缺失</span>
                          )}
                        </button>
                      ))}
                      {(!agentFilesList || agentFilesList.agentId !== selectedAgent.id) && !agentFilesLoading && (
                        <p className="text-sm text-muted-foreground">点击刷新加载文件列表</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      {!activeFileEntry ? (
                        <p className="text-sm text-muted-foreground">选择左侧文件以编辑</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <p className="font-mono text-sm">{activeFileEntry.name}</p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!fileDirty || agentFileSaving}
                                onClick={() =>
                                  agentFileActive &&
                                  setAgentFileDrafts((prev) => ({
                                    ...prev,
                                    [agentFileActive]: activeFileBase,
                                  }))
                                }
                              >
                                重置
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={!fileDirty || agentFileSaving}
                                onClick={() =>
                                  selectedAgent &&
                                  agentFileActive &&
                                  saveAgentFile(selectedAgent.id, agentFileActive, activeFileDraft)
                                }
                              >
                                {agentFileSaving ? "保存中…" : "保存"}
                              </Button>
                            </div>
                          </div>
                          <textarea
                            value={activeFileDraft}
                            onChange={(e) =>
                              agentFileActive &&
                              setAgentFileDrafts((prev) => ({
                                ...prev,
                                [agentFileActive]: e.target.value,
                              }))
                            }
                            className="w-full h-64 font-mono text-sm p-3 rounded-lg border border-border bg-background resize-y"
                            spellCheck={false}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {(activePanel === "tools" || activePanel === "skills" || activePanel === "channels" || activePanel === "cron") && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">
                    {activePanel === "tools" && "工具配置请在「配置」页 agents 节点下编辑。"}
                    {activePanel === "skills" && "技能筛选请在「配置」页或「技能」区块中管理。"}
                    {activePanel === "channels" && "渠道状态请在「渠道」区块查看。"}
                    {activePanel === "cron" && "定时任务请在「定时任务」区块查看与添加。"}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
