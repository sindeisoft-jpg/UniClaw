"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Smartphone,
  Hash,
  Mail,
  Slack,
  MessageCircle,
  Phone,
  Zap,
  Settings,
} from "lucide-react";
import { ChannelConfigForm } from "@/components/channel-config-form";
import {
  cloneConfigObject,
  setPathValue,
  serializeConfigForm,
} from "@/lib/config-form-utils";

type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  configured: boolean;
  running: boolean;
  connected?: boolean;
  lastError?: string;
  lastInboundAt?: number;
};

type ChannelsSnapshot = {
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]>;
  channels?: Record<string, unknown>;
  channelMeta?: Array<{ id: string; label: string }>;
  lastSuccessAt?: number;
};

type ChannelKey = "whatsapp" | "telegram" | "discord" | "googlechat" | "slack" | "signal" | "imessage" | "nostr";

const CHANNEL_ICONS: Record<ChannelKey, React.ElementType> = {
  whatsapp: MessageSquare,
  telegram: MessageCircle,
  discord: Hash,
  googlechat: Mail,
  slack: Slack,
  signal: Phone,
  imessage: Smartphone,
  nostr: Zap,
};

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  googlechat: "Google Chat",
  slack: "Slack",
  signal: "Signal",
  imessage: "iMessage",
  nostr: "Nostr",
};

const CHANNEL_DOCS: Partial<Record<ChannelKey, string>> = {
  whatsapp: "https://docs.openclaw.ai/channels/whatsapp",
  telegram: "https://docs.openclaw.ai/channels/telegram",
  discord: "https://docs.openclaw.ai/channels/discord",
  slack: "https://docs.openclaw.ai/channels/slack",
  signal: "https://docs.openclaw.ai/channels/signal",
  imessage: "https://docs.openclaw.ai/channels/imessage",
};

type ConfigGetResponse = {
  config?: Record<string, unknown>;
  raw?: string;
  hash?: string;
  baseHash?: string;
};

type ConfigSchemaResponse = {
  schema?: unknown;
  uiHints?: Record<string, { label?: string; help?: string; sensitive?: boolean; placeholder?: string }>;
};

export function ChannelsSection({
  onNavigateToConfig,
}: {
  onNavigateToConfig?: () => void;
} = {}) {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ChannelsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  // Config (for channel config form, aligned with openclaw 2)
  const [configForm, setConfigForm] = useState<Record<string, unknown> | null>(null);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [configSchema, setConfigSchema] = useState<unknown>(null);
  const [configSchemaLoading, setConfigSchemaLoading] = useState(false);
  const [configFormDirty, setConfigFormDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configUiHints, setConfigUiHints] = useState<
    Record<string, { label?: string; help?: string; sensitive?: boolean; placeholder?: string }>
  >({});
  // WhatsApp login
  const [whatsappMessage, setWhatsappMessage] = useState<string | null>(null);
  const [whatsappQrDataUrl, setWhatsappQrDataUrl] = useState<string | null>(null);
  const [whatsappBusy, setWhatsappBusy] = useState(false);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<ChannelsSnapshot | null>("channels.status", {
        probe: false,
        timeoutMs: 8000,
      });
      setSnapshot(res ?? null);
      if (res?.lastSuccessAt) {
        setLastSuccessAt(res.lastSuccessAt);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  const loadConfig = useCallback(async () => {
    if (!client || !connected) return;
    try {
      const res = await client.request<ConfigGetResponse>("config.get", {});
      const config = res?.config ?? null;
      setConfigForm(config && typeof config === "object" ? cloneConfigObject(config) : null);
      setBaseHash(res?.hash ?? (res as ConfigGetResponse)?.baseHash ?? null);
      setConfigFormDirty(false);
    } catch {
      // ignore
    }
  }, [client, connected]);

  const loadConfigSchema = useCallback(async () => {
    if (!client || !connected || configSchemaLoading) return;
    setConfigSchemaLoading(true);
    try {
      const res = await client.request<ConfigSchemaResponse>("config.schema", {});
      setConfigSchema(res?.schema ?? null);
      setConfigUiHints(res?.uiHints ?? {});
    } catch {
      // ignore
    } finally {
      setConfigSchemaLoading(false);
    }
  }, [client, connected, configSchemaLoading]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  useEffect(() => {
    if (connected) {
      void loadConfig();
      void loadConfigSchema();
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConfigPatch = useCallback((path: (string | number)[], value: unknown) => {
    setConfigForm((prev) => {
      const base = cloneConfigObject(prev ?? {});
      setPathValue(base as Record<string, unknown>, path, value);
      return base;
    });
    setConfigFormDirty(true);
  }, []);

  const onConfigSave = useCallback(async () => {
    if (!client || !connected || configSaving || !configForm) return;
    const raw = serializeConfigForm(configForm);
    setConfigSaving(true);
    setError(null);
    try {
      await client.request("config.set", { raw, baseHash: baseHash ?? undefined });
      setConfigFormDirty(false);
      await loadConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setConfigSaving(false);
    }
  }, [client, connected, configForm, baseHash, configSaving, loadConfig]);

  const onConfigReload = useCallback(() => {
    setConfigFormDirty(false);
    void loadConfig();
  }, [loadConfig]);

  const onWhatsAppStart = useCallback(
    async (force: boolean) => {
      if (!client || !connected || whatsappBusy) return;
      setWhatsappBusy(true);
      setWhatsappMessage(null);
      setWhatsappQrDataUrl(null);
      try {
        const res = await client.request<{ message?: string; qrDataUrl?: string }>(
          "web.login.start",
          { force, timeoutMs: 30000 },
        );
        setWhatsappMessage(res?.message ?? null);
        setWhatsappQrDataUrl(res?.qrDataUrl ?? null);
      } catch (e) {
        setWhatsappMessage(String(e));
        setWhatsappQrDataUrl(null);
      } finally {
        setWhatsappBusy(false);
      }
    },
    [client, connected, whatsappBusy],
  );

  const onWhatsAppWait = useCallback(async () => {
    if (!client || !connected || whatsappBusy) return;
    setWhatsappBusy(true);
    try {
      const res = await client.request<{ message?: string; connected?: boolean }>(
        "web.login.wait",
        { timeoutMs: 120000 },
      );
      setWhatsappMessage(res?.message ?? null);
      if (res?.connected) setWhatsappQrDataUrl(null);
    } catch (e) {
      setWhatsappMessage(String(e));
    } finally {
      setWhatsappBusy(false);
    }
  }, [client, connected, whatsappBusy]);

  const onWhatsAppLogout = useCallback(async () => {
    if (!client || !connected || whatsappBusy) return;
    setWhatsappBusy(true);
    try {
      await client.request("channels.logout", { channel: "whatsapp" });
      setWhatsappMessage("已退出登录");
      setWhatsappQrDataUrl(null);
    } catch (e) {
      setWhatsappMessage(String(e));
    } finally {
      setWhatsappBusy(false);
    }
  }, [client, connected, whatsappBusy]);

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

  const hasRecentActivity = (account: ChannelAccountSnapshot): boolean => {
    if (!account.lastInboundAt) return false;
    return Date.now() - account.lastInboundAt < 10 * 60 * 1000; // 10 minutes
  };

  const deriveRunningStatus = (account: ChannelAccountSnapshot): string => {
    if (account.running) return "是";
    if (hasRecentActivity(account)) return "活跃";
    return "否";
  };

  const deriveConnectedStatus = (account: ChannelAccountSnapshot): string => {
    if (account.connected === true) return "是";
    if (account.connected === false) return "否";
    if (hasRecentActivity(account)) return "活跃";
    return "—";
  };

  const getChannelOrder = (): ChannelKey[] => {
    if (snapshot?.channelMeta?.length) {
      return snapshot.channelMeta.map(entry => entry.id as ChannelKey);
    }
    if (snapshot?.channelOrder?.length) {
      return snapshot.channelOrder as ChannelKey[];
    }
    return ["whatsapp", "telegram", "discord", "googlechat", "slack", "signal", "imessage", "nostr"];
  };

  const getChannelLabel = (key: ChannelKey): string => {
    const meta = snapshot?.channelMeta?.find(entry => entry.id === key);
    return meta?.label || snapshot?.channelLabels?.[key] || CHANNEL_LABELS[key] || key;
  };

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const runningStatus = deriveRunningStatus(account);
    const connectedStatus = deriveConnectedStatus(account);

    return (
      <Card key={account.accountId} className="p-4">
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">{account.name || account.accountId}</div>
            <div className="text-xs text-muted-foreground">{account.accountId}</div>
          </div>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">运行中</span>
            <span className={runningStatus === "是" ? "text-green-600" : runningStatus === "活跃" ? "text-amber-600" : "text-red-600"}>
              {runningStatus}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">已配置</span>
            <span className={account.configured ? "text-green-600" : "text-red-600"}>
              {account.configured ? "是" : "否"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">已连接</span>
            <span className={connectedStatus === "是" ? "text-green-600" : connectedStatus === "活跃" ? "text-amber-600" : "text-red-600"}>
              {connectedStatus}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">最近入站</span>
            <span>{account.lastInboundAt ? formatRelativeTimestamp(account.lastInboundAt) : "n/a"}</span>
          </div>
        </div>

        {account.lastError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <div className="flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{account.lastError}</span>
            </div>
          </div>
        )}
      </Card>
    );
  };

  const renderChannelCard = (key: ChannelKey) => {
    const Icon = CHANNEL_ICONS[key];
    const label = getChannelLabel(key);
    const accounts = snapshot?.channelAccounts?.[key] || [];
    const channelStatus = snapshot?.channels?.[key] as Record<string, unknown> | undefined;
    const configured = typeof channelStatus?.configured === "boolean" ? channelStatus.configured : undefined;
    const running = typeof channelStatus?.running === "boolean" ? channelStatus.running : undefined;
    const connected = typeof channelStatus?.connected === "boolean" ? channelStatus.connected : undefined;
    const lastError = typeof channelStatus?.lastError === "string" ? channelStatus.lastError : undefined;
    const linked = typeof channelStatus?.linked === "boolean" ? channelStatus.linked : undefined;
    const lastConnectedAt =
      typeof channelStatus?.lastConnectedAt === "number" ? channelStatus.lastConnectedAt : undefined;

    const configDisabled = configSaving || configSchemaLoading;

    return (
      <Card key={key} className="p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-medium">{label}</h3>
                <p className="text-sm text-muted-foreground">渠道状态与配置</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {accounts.length > 0 ? `${accounts.length}个账号` : "无账号"}
            </div>
          </div>
        </div>

        {key === "whatsapp" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="space-y-0.5">
                <div className="text-muted-foreground">已配置</div>
                <div className={configured ? "text-green-600" : "text-red-600"}>
                  {configured == null ? "n/a" : configured ? "是" : "否"}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">已关联</div>
                <div className={linked ? "text-green-600" : "text-red-600"}>
                  {linked == null ? "n/a" : linked ? "是" : "否"}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">运行中</div>
                <div className={running ? "text-green-600" : "text-red-600"}>
                  {running == null ? "n/a" : running ? "是" : "否"}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">已连接</div>
                <div className={connected ? "text-green-600" : "text-red-600"}>
                  {connected == null ? "n/a" : connected ? "是" : "否"}
                </div>
              </div>
            </div>
            {whatsappMessage && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                {whatsappMessage}
              </div>
            )}
            {whatsappQrDataUrl && (
              <div className="mt-3 flex justify-center rounded-lg border border-border bg-muted/30 p-4">
                <img src={whatsappQrDataUrl} alt="WhatsApp 二维码" className="max-w-[200px]" />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={whatsappBusy}
                onClick={() => onWhatsAppStart(false)}
              >
                {whatsappBusy ? "处理中…" : "显示二维码"}
              </Button>
              <Button size="sm" variant="outline" disabled={whatsappBusy} onClick={() => onWhatsAppStart(true)}>
                重新关联
              </Button>
              <Button size="sm" variant="outline" disabled={whatsappBusy} onClick={onWhatsAppWait}>
                等待扫码
              </Button>
              <Button size="sm" variant="destructive" disabled={whatsappBusy} onClick={onWhatsAppLogout}>
                退出登录
              </Button>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                刷新
              </Button>
            </div>
          </>
        )}

        {key !== "whatsapp" && (
          <>
            {accounts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(renderAccountCard)}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">已配置</div>
                    <div className={configured ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {configured == null ? "n/a" : configured ? "是" : "否"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">运行中</div>
                    <div className={running ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {running == null ? "n/a" : running ? "是" : "否"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">已连接</div>
                    <div className={connected ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {connected == null ? "n/a" : connected ? "是" : "否"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {lastError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div className="text-sm text-red-800 dark:text-red-300">{lastError}</div>
            </div>
          </div>
        )}

        {/* 渠道配置表单（与 openclaw 2 一致：内联在卡片内） */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">渠道配置</span>
          </div>
          {configSchemaLoading ? (
            <div className="text-sm text-muted-foreground">加载配置结构中…</div>
          ) : (
            <ChannelConfigForm
              channelId={key}
              configForm={configForm}
              schema={configSchema}
              uiHints={configUiHints}
              disabled={configDisabled}
              onPatch={onConfigPatch}
            />
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={configDisabled || !configFormDirty}
              onClick={onConfigSave}
            >
              {configSaving ? "保存中…" : "保存"}
            </Button>
            <Button size="sm" variant="outline" disabled={configDisabled} onClick={onConfigReload}>
              重新加载
            </Button>
            {onNavigateToConfig && (
              <Button size="sm" variant="ghost" onClick={onNavigateToConfig}>
                前往配置页
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (!connected) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium">未连接网关</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          请先连接网关后在概览中配置连接。
        </p>
      </div>
    );
  }

  const channelOrder = getChannelOrder();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">渠道管理</h2>
          <p className="text-sm text-muted-foreground">
            管理 WhatsApp、Telegram、Discord 等消息渠道
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSuccessAt && (
            <div className="text-sm text-muted-foreground">
              最后更新：{formatRelativeTimestamp(lastSuccessAt)}
            </div>
          )}
          <Button onClick={load} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "加载中…" : "刷新"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="text-sm text-red-800 dark:text-red-300">{error}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {channelOrder.map(renderChannelCard)}
      </div>

      {/* 渠道状态快照 */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-medium">渠道状态快照</h3>
          <p className="text-sm text-muted-foreground">来自网关的渠道状态快照</p>
        </div>
        <pre className="rounded-lg bg-muted p-4 text-sm overflow-auto max-h-96">
          {snapshot ? JSON.stringify(snapshot, null, 2) : "暂无快照。"}
        </pre>
      </Card>
    </div>
  );
}
