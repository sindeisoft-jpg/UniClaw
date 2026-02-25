"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

/** Gateway system-presence returns an array of these (see src/infra/system-presence.ts). */
type SystemPresenceItem = {
  host?: string;
  ip?: string;
  version?: string;
  mode?: string;
  reason?: string;
  deviceId?: string;
  instanceId?: string;
  text?: string;
  ts?: number;
};

type PresenceEntry = {
  clientId?: string;
  displayName?: string;
  connected?: boolean;
  mode?: string;
};

const PRESENCE_TTL_MS = 5 * 60 * 1000;

function toPresenceEntry(p: SystemPresenceItem): PresenceEntry {
  const clientId = p.host ?? p.deviceId ?? p.instanceId ?? undefined;
  const displayName = p.text ?? (p.host ? `${p.host}${p.ip ? ` (${p.ip})` : ""}` : undefined);
  const connected =
    p.ts != null ? Date.now() - p.ts < PRESENCE_TTL_MS : true;
  return {
    clientId,
    displayName,
    connected,
    mode: p.mode ?? (p.reason ? String(p.reason) : undefined),
  };
}

export function InstancesSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<SystemPresenceItem[] | { entries?: SystemPresenceItem[] }>(
        "system-presence",
        {},
      );
      const raw = Array.isArray(res) ? res : res?.entries ?? [];
      setEntries(raw.map(toPresenceEntry));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!connected) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        请先连接网关后在概览中配置连接。
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        实例即已连接网关的客户端与节点（如本机网关、Mac 应用、配对设备等）。网关会定期上报自身；其他客户端连接并上报后也会出现在列表中。
      </p>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
      >
        {loading ? "加载中…" : "刷新"}
      </button>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">客户端 ID</th>
              <th className="px-4 py-2 text-left font-medium">显示名</th>
              <th className="px-4 py-2 text-left font-medium">模式</th>
              <th className="px-4 py-2 text-left font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  暂无在线实例
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{e.clientId ?? "—"}</td>
                  <td className="px-4 py-2">{e.displayName ?? "—"}</td>
                  <td className="px-4 py-2">{e.mode ?? "—"}</td>
                  <td className="px-4 py-2">
                    {e.connected ? (
                      <span className="text-green-600 dark:text-green-400">已连接</span>
                    ) : (
                      <span className="text-muted-foreground">离线</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
