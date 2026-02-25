"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useGateway } from "@/contexts/gateway-context";
import { ChatHeaderSlotProvider } from "@/contexts/chat-header-slot";
import { Sun, Moon, Menu, X } from "lucide-react";
import {
  MessageCircle,
  LayoutDashboard,
  Link2,
  Radio,
  ScrollText,
  BarChart2,
  CalendarClock,
  Bot,
  Zap,
  Server,
  Settings,
  Bug,
  FileText,
  BookOpen,
} from "lucide-react";
import {
  OverviewSection,
  ChatSection,
  ChannelsSection,
  InstancesSection,
  SessionsSection,
  UsageSection,
  CronSection,
  AgentsSection,
  SkillsSection,
  NodesSection,
  ConfigSection,
  DebugSection,
  LogsSection,
} from "./sections";
import { ExecApprovalOverlay } from "./exec-approval-overlay";
import { GatewayUrlConfirmationOverlay } from "./gateway-url-confirmation-overlay";

type SectionId =
  | "overview"
  | "chat"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "agents"
  | "skills"
  | "nodes"
  | "config"
  | "debug"
  | "logs";

const SECTION_ICONS: Record<SectionId, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  chat: MessageCircle,
  channels: Link2,
  instances: Radio,
  sessions: ScrollText,
  usage: BarChart2,
  cron: CalendarClock,
  agents: Bot,
  skills: Zap,
  nodes: Server,
  config: Settings,
  debug: Bug,
  logs: FileText,
};

const NAV_GROUPS: {
  label: string;
  labelEn: string;
  items: { id: SectionId; label: string; labelEn: string }[];
}[] = [
  { label: "聊天", labelEn: "Chat", items: [{ id: "chat", label: "聊天", labelEn: "Chat" }] },
  {
    label: "控制",
    labelEn: "Control",
    items: [
      { id: "overview", label: "概览", labelEn: "Overview" },
      { id: "channels", label: "渠道", labelEn: "Channels" },
      { id: "instances", label: "实例", labelEn: "Instances" },
      { id: "sessions", label: "会话", labelEn: "Sessions" },
      { id: "usage", label: "用量", labelEn: "Usage" },
      { id: "cron", label: "定时任务", labelEn: "Cron Jobs" },
    ],
  },
  {
    label: "智能体",
    labelEn: "Agent",
    items: [
      { id: "agents", label: "智能体", labelEn: "Agents" },
      { id: "skills", label: "技能", labelEn: "Skills" },
      { id: "nodes", label: "节点", labelEn: "Nodes" },
    ],
  },
  {
    label: "设置",
    labelEn: "Settings",
    items: [
      { id: "config", label: "配置", labelEn: "Config" },
      { id: "debug", label: "调试", labelEn: "Debug" },
      { id: "logs", label: "日志", labelEn: "Logs" },
    ],
  },
];

const SECTION_LABELS: Record<SectionId, string> = {
  overview: "概览",
  chat: "聊天",
  channels: "渠道",
  instances: "实例",
  sessions: "会话",
  usage: "用量",
  cron: "定时任务",
  agents: "智能体",
  skills: "技能",
  nodes: "节点",
  config: "配置",
  debug: "调试",
  logs: "日志",
};

const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  overview: "连接网关后在此查看状态与快捷操作。",
  chat: "与智能体对话。",
  channels: "管理 Telegram、Discord、Slack 等渠道连接。",
  instances: "已连接客户端与节点的在线状态。",
  sessions: "查看活跃会话并调整每会话默认项。",
  usage: "查看用量与配额。",
  cron: "安排唤醒与周期性智能体运行。",
  agents: "管理智能体工作区、工具与身份。",
  skills: "管理技能可用性与 API 密钥注入。",
  nodes: "配对设备、能力与命令暴露。",
  config: "安全编辑网关配置。",
  debug: "网关快照、事件与手动 RPC 调用。",
  logs: "网关日志文件实时查看。",
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 md:min-h-0 md:min-w-0"
      aria-label="切换主题"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute inset-0 m-auto h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}

function errorHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("device identity required")) {
    return "请使用 HTTPS 或 localhost 打开控制台以启用设备身份认证；或在网关配置中设置 gateway.controlUi.allowInsecureAuth 允许仅 Token 认证。";
  }
  if (lower.includes("secure context")) {
    return "请使用 HTTPS 或 localhost 打开本页。";
  }
  if (
    lower.includes("connection error") ||
    lower.includes("code 1006") ||
    lower.startsWith("closed:")
  ) {
    return "请确认网关已启动（openclaw gateway run），且地址正确（默认 ws://127.0.0.1:18789）。若通过 Mac 应用使用，请从应用内启动网关。";
  }
  return null;
}

type OverviewStats = {
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
};

function SectionContent({
  section,
  setSection,
  initialSessionKeyFromUrl,
  overviewStats,
}: {
  section: SectionId;
  setSection: (id: SectionId) => void;
  initialSessionKeyFromUrl: string | null;
  overviewStats: OverviewStats;
}) {
  const gateway = useGateway();
  switch (section) {
    case "overview":
      return (
        <OverviewSection
          hello={gateway.hello}
          url={gateway.url}
          token={gateway.token}
          onUrlChange={gateway.setUrl}
          onTokenChange={gateway.setToken}
          onSaveCredentials={gateway.persistGatewayCredentials}
          connected={gateway.connected}
          connecting={false}
          lastError={gateway.error}
          presenceCount={overviewStats.presenceCount}
          sessionsCount={overviewStats.sessionsCount}
          cronEnabled={overviewStats.cronEnabled}
          cronNext={overviewStats.cronNext}
          lastChannelsRefresh={overviewStats.lastChannelsRefresh}
          onPasswordChange={() => {}}
          onSessionKeyChange={() => {}}
          onRefresh={gateway.reconnect}
          onConnect={gateway.requestConnect}
          onNavigateToSection={(id) => setSection(id as SectionId)}
        />
      );
    case "chat":
      return <ChatSection initialSessionKey={initialSessionKeyFromUrl ?? undefined} />;
    case "channels":
      return <ChannelsSection onNavigateToConfig={() => setSection("config")} />;
    case "instances":
      return <InstancesSection />;
    case "sessions":
      return <SessionsSection />;
    case "usage":
      return <UsageSection />;
    case "cron":
      return <CronSection />;
    case "agents":
      return <AgentsSection />;
    case "skills":
      return <SkillsSection />;
    case "nodes":
      return <NodesSection />;
    case "config":
      return <ConfigSection />;
    case "debug":
      return <DebugSection />;
    case "logs":
      return <LogsSection />;
    default:
      return null;
  }
}

export function Shell() {
  const searchParams = useSearchParams();
  const urlSession = searchParams.get("session");
  const { client, connected, error, url, token, setUrl, setToken, reconnect } = useGateway();
  const [overviewStats, setOverviewStats] = useState<OverviewStats>({
    presenceCount: 0,
    sessionsCount: null,
    cronEnabled: null,
    cronNext: null,
    lastChannelsRefresh: null,
  });
  useEffect(() => {
    if (!client || !connected) {
      setOverviewStats((s) => ({
        ...s,
        presenceCount: 0,
        sessionsCount: null,
        cronEnabled: null,
        cronNext: null,
        lastChannelsRefresh: null,
      }));
      return;
    }
    let cancelled = false;
    Promise.all([
      client.request<unknown[] | { entries?: unknown[] }>("system-presence", {}).then((res) => {
        const arr = Array.isArray(res) ? res : res?.entries ?? [];
        return arr.length;
      }),
      client
        .request<{ count?: number }>("sessions.list", {})
        .then((res) => res?.count ?? null),
      client
        .request<{ enabled?: boolean; nextWakeAtMs?: number | null }>("cron.status", {})
        .then((res) => ({
          enabled: res?.enabled ?? null,
          nextWakeAtMs: res?.nextWakeAtMs ?? null,
        })),
    ])
      .then(([presenceCount, sessionsCount, cron]) => {
        if (cancelled) return;
        setOverviewStats({
          presenceCount: typeof presenceCount === "number" ? presenceCount : 0,
          sessionsCount,
          cronEnabled: cron.enabled,
          cronNext: cron.nextWakeAtMs,
          lastChannelsRefresh: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setOverviewStats((s) => ({ ...s, presenceCount: 0, sessionsCount: null }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, connected]);
  // Open chat on first paint when URL has ?session=... so conversation mode works immediately.
  const [section, setSection] = useState<SectionId>(() =>
    urlSession?.trim() ? "chat" : "overview",
  );
  const [chatHeaderContent, setChatHeaderContent] = useState<ReactNode>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hint = error ? errorHint(error) : null;
  const currentLabel = SECTION_LABELS[section] ?? section;

  // When URL gains or loses ?session=..., switch to chat or keep in sync.
  useEffect(() => {
    if (urlSession?.trim()) setSection("chat");
  }, [urlSession]);

  const closeSidebar = () => setSidebarOpen(false);
  const goTo = (id: SectionId) => {
    setSection(id);
    closeSidebar();
  };

  const navContent = (
    <>
      <div className="relative flex h-14 shrink-0 flex-col justify-center border-b border-border px-4 py-2">
        <div className="flex items-center gap-2.5 pr-12 md:pr-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold uppercase tracking-tight text-foreground">
              OpenClaw
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Gateway Dashboard
            </div>
          </div>
        </div>
        <button
          type="button"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
          onClick={closeSidebar}
          aria-label="关闭菜单"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 space-y-5 overflow-auto p-3 overscroll-contain">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 flex items-center gap-1.5 px-2 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.labelEn} {group.label}
              </span>
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const isActive = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(item.id)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
                      isActive
                        ? "border-l-[3px] border-primary bg-primary/10 text-primary"
                        : "border-l-[3px] border-transparent text-muted-foreground"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                    )}
                    <span className="truncate">
                      {item.labelEn} {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Resources 资源
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground">
              <BookOpen className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">Docs 文档</span>
            </span>
          </div>
        </div>
      </nav>
    </>
  );

  return (
    <ChatHeaderSlotProvider content={chatHeaderContent} setContent={setChatHeaderContent}>
    <div className="flex h-screen max-h-[100dvh] bg-background text-foreground">
      {/* Mobile overlay when sidebar open */}
      <div
        role="presentation"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
        aria-hidden
      />
      {/* Sidebar: drawer on mobile, rail on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card shadow-lg transition-transform duration-200 ease-out md:relative md:z-auto md:w-56 md:translate-x-0 md:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {navContent}
      </aside>

      <main className="flex flex-1 flex-col min-w-0 bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/50 px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-4">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </button>
            {section === "chat" && chatHeaderContent}
            <span className="truncate text-sm text-muted-foreground">网关控制</span>
            {connected ? (
              <span className="shrink-0 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-500 dark:text-green-400">
                已连接
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                未连接
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <ExecApprovalOverlay />
        <GatewayUrlConfirmationOverlay />

        <div
          className={cn(
            "overscroll-contain",
            section === "chat" && "flex flex-1 flex-col min-h-0",
            section === "overview" && "flex flex-1 flex-col min-h-0 overflow-auto",
            section !== "chat" && section !== "overview" && "flex-1 overflow-auto p-4 md:p-6"
          )}
        >
          {section === "chat" ? (
            <SectionContent
              section={section}
              setSection={setSection}
              initialSessionKeyFromUrl={urlSession}
              overviewStats={overviewStats}
            />
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <div>{error}</div>
                  {hint && (
                    <div className="mt-2 text-muted-foreground">{hint}</div>
                  )}
                </div>
              )}
              {section === "overview" ? (
                <SectionContent
                  section={section}
                  setSection={setSection}
                  initialSessionKeyFromUrl={urlSession}
                  overviewStats={overviewStats}
                />
              ) : (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm ring-0 md:p-6">
                  <h1 className="text-xl font-semibold text-foreground">{currentLabel}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {SECTION_DESCRIPTIONS[section]}
                  </p>
                  <SectionContent
                    section={section}
                    setSection={setSection}
                    initialSessionKeyFromUrl={urlSession}
                    overviewStats={overviewStats}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
    </ChatHeaderSlotProvider>
  );
}
