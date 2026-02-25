"use client";

import { useState, useEffect, useCallback } from "react";
import type { GatewayHelloOk } from "@/lib/gateway-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { 
  Wifi, 
  WifiOff, 
  Server, 
  Cpu, 
  Clock, 
  Users,
  Activity,
  RefreshCw,
  Settings,
  Shield,
  Key,
  MessageSquare,
  Calendar,
  AlertCircle,
  HelpCircle,
  ExternalLink
} from "lucide-react";

/** Kimi-style quick nav chip: id and label for overview hero */
const HERO_CHIPS: { id: string; label: string }[] = [
  { id: "chat", label: "聊天" },
  { id: "channels", label: "渠道" },
  { id: "instances", label: "实例" },
  { id: "agents", label: "智能体" },
  { id: "skills", label: "技能" },
  { id: "config", label: "配置" },
];

type OverviewSectionProps = {
  hello: GatewayHelloOk | null;
  url: string;
  token: string;
  onUrlChange: (url: string) => void;
  onTokenChange: (token: string) => void;
  onSaveCredentials?: () => void;
  onConnect: () => void;
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onPasswordChange: (password: string) => void;
  onSessionKeyChange: (sessionKey: string) => void;
  onRefresh: () => void;
  /** Navigate to another section (e.g. chat) from hero input/chips */
  onNavigateToSection?: (id: string) => void;
};

export function OverviewSection({
  hello,
  url,
  token,
  onUrlChange,
  onTokenChange,
  onSaveCredentials,
  onConnect,
  connected,
  connecting,
  lastError,
  presenceCount,
  sessionsCount,
  cronEnabled,
  cronNext,
  lastChannelsRefresh,
  onPasswordChange,
  onSessionKeyChange,
  onRefresh,
  onNavigateToSection,
}: OverviewSectionProps) {
  const [heroInput, setHeroInput] = useState("");
  const [password, setPassword] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const handleSaveCredentials = useCallback(() => {
    onSaveCredentials?.();
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2000);
  }, [onSaveCredentials]);
  const [uptime, setUptime] = useState<string>("");
  const [gatewayVersion, setGatewayVersion] = useState<string>("");
  const [nodeVersion, setNodeVersion] = useState<string>("");
  const [tickInterval, setTickInterval] = useState<string>("");

  useEffect(() => {
    if (hello) {
      // 解析网关信息 - 使用快照中的版本信息
      const snapshot = hello.snapshot as Record<string, unknown> | undefined;
      const version = snapshot?.version || "未知";
      const node = snapshot?.nodeVersion || "未知";
      const tick = (snapshot as any)?.policy?.tickIntervalMs ? `${(snapshot as any).policy.tickIntervalMs}ms` : "n/a";
      setGatewayVersion(String(version));
      setNodeVersion(String(node));
      setTickInterval(tick);
      
      // 计算运行时间
      if (snapshot?.uptimeMs) {
        const uptimeMs = Number(snapshot.uptimeMs);
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        setUptime(`${hours}小时 ${minutes}分钟`);
      } else if (snapshot?.startedAt) {
        const started = new Date(String(snapshot.startedAt));
        const now = new Date();
        const diff = now.getTime() - started.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setUptime(`${hours}小时 ${minutes}分钟`);
      } else {
        setUptime("未知");
      }
    }
  }, [hello]);

  const formatRelativeTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return "刚刚";
  };

  const formatNextRun = (timestamp: number | null) => {
    if (!timestamp) return "无";
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return "即将运行";
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天后`;
    if (hours > 0) return `${hours}小时后`;
    if (minutes > 0) return `${minutes}分钟后`;
    return "即将运行";
  };

  const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
  const showInsecureContextHint = !connected && lastError && 
    (lastError.toLowerCase().includes("secure context") || 
     lastError.toLowerCase().includes("device identity required")) && 
    !isSecureContext;

  const showAuthHint = !connected && lastError && 
    (lastError.toLowerCase().includes("unauthorized") || 
     lastError.toLowerCase().includes("connect failed"));

  const stats = [
    {
      label: "连接状态",
      value: connected ? "已连接" : "未连接",
      icon: connected ? Wifi : WifiOff,
      color: connected ? "text-green-600" : "text-red-600",
    },
    {
      label: "网关版本",
      value: gatewayVersion,
      icon: Server,
      color: "text-blue-600",
    },
    {
      label: "协议版本",
      value: hello?.protocol || "未知",
      icon: Shield,
      color: "text-purple-600",
    },
    {
      label: "运行时间",
      value: uptime,
      icon: Clock,
      color: "text-amber-600",
    },
    {
      label: "心跳间隔",
      value: tickInterval,
      icon: Activity,
      color: "text-cyan-600",
    },
    {
      label: "Node.js",
      value: nodeVersion,
      icon: Cpu,
      color: "text-emerald-600",
    },
  ];

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onNavigateToSection) onNavigateToSection("chat");
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Kimi-style hero: centered title + big input + chips */}
      <div className="kimi-hero-bg flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-16" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          OpenClaw
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          网关控制 · 智能体与渠道
        </p>
        <form
          onSubmit={handleHeroSubmit}
          className="mt-8 w-full max-w-2xl"
        >
          <div className="relative flex items-center rounded-2xl border border-border bg-card/80 shadow-sm ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-sm">
            <input
              type="text"
              value={heroInput}
              onChange={(e) => setHeroInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
              }}
              placeholder="问点什么…"
              className="kimi-hero-input h-14 w-full rounded-2xl border-0 bg-transparent px-5 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:h-16 sm:text-lg"
              aria-label="输入问题或跳转到聊天"
            />
            <button
              type="submit"
              className="absolute right-3 flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 sm:right-4 sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
              aria-label="进入聊天"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </form>
        {onNavigateToSection && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {HERO_CHIPS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigateToSection(id)}
                className="min-h-[44px] rounded-full border border-border bg-card/60 px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:bg-card/80"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 网关连接与状态（紧凑区域） */}
      <div className="space-y-6 border-t border-border bg-background/95 px-4 py-6 backdrop-blur-sm">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Server className="h-5 w-5" />
              网关连接
            </h3>
            <p className="text-sm text-muted-foreground">
              控制台连接地址与认证方式
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">WebSocket 地址</label>
              <Input
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="ws://127.0.0.1:18789"
              />
              <p className="text-xs text-muted-foreground">
                默认网关地址：ws://127.0.0.1:18789
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">网关 Token</label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => onTokenChange(e.target.value)}
                  placeholder="OPENCLAW_GATEWAY_TOKEN"
                  className="flex-1"
                />
                {onSaveCredentials && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveCredentials}
                    className="shrink-0"
                  >
                    {savedHint ? "已保存" : "保存"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                在网关配置中设置的认证令牌；点击「保存」可保存到本地，下次打开自动填充
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">密码（不保存）</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  onPasswordChange(e.target.value);
                }}
                placeholder="系统或共享密码"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">默认会话 Key</label>
              <Input
                value={sessionKey}
                onChange={(e) => {
                  setSessionKey(e.target.value);
                  onSessionKeyChange(e.target.value);
                }}
                placeholder="会话标识符"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={onConnect} disabled={connecting}>
                <RefreshCw className={`h-4 w-4 mr-2 ${connecting ? "animate-spin" : ""}`} />
                {connecting ? "连接中..." : "连接"}
              </Button>
              <Button variant="outline" onClick={onRefresh}>
                刷新
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                点击「连接」应用连接设置
              </span>
            </div>
          </div>
        </Card>

        {/* 快照信息 */}
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Activity className="h-5 w-5" />
              快照
            </h3>
            <p className="text-sm text-muted-foreground">
              最近一次网关握手信息
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">状态</div>
              <div className={`text-lg font-medium ${connected ? "text-green-600" : "text-amber-600"}`}>
                {connected ? "已连接" : "未连接"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">运行时长</div>
              <div className="text-lg font-medium">{uptime}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">心跳间隔</div>
              <div className="text-lg font-medium">{tickInterval}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">渠道最后刷新</div>
              <div className="text-lg font-medium">
                {lastChannelsRefresh ? formatRelativeTimestamp(lastChannelsRefresh) : "n/a"}
              </div>
            </div>
          </div>

          {lastError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="space-y-2">
                  <div className="text-sm font-medium text-red-800 dark:text-red-300">
                    {lastError}
                  </div>
                  {showAuthHint && (
                    <div className="text-sm text-red-700 dark:text-red-400">
                      {!token.trim() && !password.trim() ? (
                        <div className="space-y-2">
                          <p>此网关需要认证。请填写 Token 或密码后点击「连接」。</p>
                          <div className="space-y-1 text-xs">
                            <div><code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900">openclaw dashboard --no-open</code> → 打开控制台</div>
                            <div><code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900">openclaw doctor --generate-gateway-token</code> → 生成 Token</div>
                          </div>
                          <div className="pt-1">
                            <a
                              href="https://docs.openclaw.ai/web/dashboard"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              文档：控制台认证
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p>认证失败。请在控制台设置中更新 Token 或密码后点击「连接」。</p>
                          <div>
                            <a
                              href="https://docs.openclaw.ai/web/dashboard"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              文档：控制台认证
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {showInsecureContextHint && (
                    <div className="text-sm text-red-700 dark:text-red-400">
                      <p>当前为 HTTP 页面，浏览器会限制设备身份。请使用 HTTPS（如 Tailscale Serve）或在网关主机打开 <code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900">http://127.0.0.1:18789</code>。</p>
                      <p className="mt-1">若必须使用 HTTP，请设置 <code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900">gateway.controlUi.allowInsecureAuth: true</code>（仅 Token 认证）。</p>
                      <div className="mt-2 space-x-3">
                        <a
                          href="https://docs.openclaw.ai/gateway/tailscale"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          文档：Tailscale Serve
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href="https://docs.openclaw.ai/web/control-ui#insecure-http"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          文档：非安全 HTTP
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!lastError && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                在「渠道」中关联 WhatsApp、Telegram、Discord、Signal 或 iMessage。
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div className="text-sm text-muted-foreground">实例</div>
            </div>
            <div className="text-2xl font-bold">{presenceCount}</div>
            <div className="text-xs text-muted-foreground">过去 5 分钟内的在线数量</div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <div className="text-sm text-muted-foreground">会话</div>
            </div>
            <div className="text-2xl font-bold">{sessionsCount ?? "n/a"}</div>
            <div className="text-xs text-muted-foreground">网关跟踪的最近会话 Key</div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              <div className="text-sm text-muted-foreground">定时任务</div>
            </div>
            <div className="text-2xl font-bold">
              {cronEnabled == null ? "n/a" : cronEnabled ? "已启用" : "已关闭"}
            </div>
            <div className="text-xs text-muted-foreground">下次唤醒 {formatNextRun(cronNext)}</div>
          </div>
        </Card>
      </div>

      {/* 提示卡片 */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            提示
          </h3>
          <p className="text-sm text-muted-foreground">远程控制相关快速提醒</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="font-medium text-sm">Tailscale 服务</div>
            <div className="text-sm text-muted-foreground">
              建议使用 serve 模式，网关仅监听本地并由 tailnet 认证。
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-sm">会话清理</div>
            <div className="text-sm text-muted-foreground">
              使用 /new 或 sessions.patch 重置上下文。
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-sm">定时任务</div>
            <div className="text-sm text-muted-foreground">
              周期性任务建议使用独立会话。
            </div>
          </div>
        </div>
      </Card>

      {/* 功能概览 */}
      {hello?.features?.methods && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">可用功能</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {hello.features.methods.slice(0, 12).map((method, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-card p-3 text-center"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {method.split(".")[0]}
                </div>
                <div className="truncate text-sm">{method.split(".").slice(1).join(".")}</div>
              </div>
            ))}
            {hello.features.methods.length > 12 && (
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="text-sm font-medium">+{hello.features.methods.length - 12}</div>
                <div className="text-xs text-muted-foreground">更多功能</div>
              </div>
            )}
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
