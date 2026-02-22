"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

type PendingDevice = {
  requestId: string;
  deviceId: string;
  displayName?: string;
  role?: string;
  remoteIp?: string;
};
type PairedDevice = {
  deviceId: string;
  displayName?: string;
  roles?: string[];
  remoteIp?: string;
  tokens?: Array<{ role: string; scopes?: string[] }>;
};
type DeviceList = { pending?: PendingDevice[]; paired?: PairedDevice[] };

export function NodesSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<DeviceList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<{ pending?: PendingDevice[]; paired?: PairedDevice[] }>(
        "device.pair.list",
        {}
      );
      setList({
        pending: res?.pending ?? [],
        paired: res?.paired ?? [],
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  async function approve(requestId: string) {
    if (!client || !connected) return;
    try {
      await client.request("device.pair.approve", { requestId });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function reject(requestId: string) {
    if (!client || !connected || !confirm("确定拒绝该设备配对？")) return;
    try {
      await client.request("device.pair.reject", { requestId });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function revoke(deviceId: string, role: string) {
    if (!client || !connected || !confirm("确定撤销该设备 Token？")) return;
    try {
      await client.request("device.token.revoke", { deviceId, role });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (!connected) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        请先连接网关后在概览中配置连接。
      </p>
    );
  }

  const pending = list?.pending ?? [];
  const paired = list?.paired ?? [];

  return (
    <div className="mt-4 space-y-6">
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

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">待配对</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">设备 ID</th>
                <th className="px-4 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-muted-foreground">
                    无待配对设备
                  </td>
                </tr>
              ) : (
                pending.map((p) => (
                  <tr key={p.requestId} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{p.deviceId}</td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve(p.requestId)}
                        className="text-green-600 dark:text-green-400 hover:underline text-xs"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        onClick={() => reject(p.requestId)}
                        className="text-destructive hover:underline text-xs"
                      >
                        拒绝
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">已配对</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">设备 ID</th>
                <th className="px-4 py-2 text-left font-medium">角色/Token</th>
                <th className="px-4 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {paired.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">
                    无已配对设备
                  </td>
                </tr>
              ) : (
                paired.map((d) =>
                  (d.tokens && d.tokens.length > 0 ? d.tokens : [{ role: "operator" }]).map(
                    (t) => (
                      <tr
                        key={`${d.deviceId}-${t.role}`}
                        className="border-t border-border"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{d.deviceId}</td>
                        <td className="px-4 py-2">{t.role}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => revoke(d.deviceId, t.role)}
                            className="text-destructive hover:underline text-xs"
                          >
                            撤销
                          </button>
                        </td>
                      </tr>
                    )
                  )
                ).flat()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
