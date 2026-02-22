"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

type CronJob = {
  id: string;
  schedule?: unknown;
  payload?: unknown;
  enabled?: boolean;
};
type CronStatus = { nextWakeAtMs?: number };

export function CronSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [listRes, statusRes] = await Promise.all([
        client.request<{ jobs?: CronJob[] }>("cron.list", { includeDisabled: true }),
        client.request<CronStatus>("cron.status", {}),
      ]);
      setJobs(Array.isArray(listRes?.jobs) ? listRes.jobs : []);
      setStatus(statusRes ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  async function toggleEnabled(id: string, enabled: boolean) {
    if (!client || !connected) return;
    try {
      await client.request("cron.update", { id, patch: { enabled } });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function runNow(id: string) {
    if (!client || !connected) return;
    try {
      await client.request("cron.run", { id, mode: "force" });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: string) {
    if (!client || !connected || !confirm("确定删除该定时任务？")) return;
    try {
      await client.request("cron.remove", { id });
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

  return (
    <div className="mt-4 space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {status?.nextWakeAtMs != null && (
          <span>下次唤醒: {new Date(status.nextWakeAtMs).toLocaleString()}</span>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">启用</th>
              <th className="px-4 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  暂无定时任务
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{j.id}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleEnabled(j.id, !j.enabled)}
                      className={`rounded px-2 py-1 text-xs ${j.enabled ? "bg-green-500/20 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                    >
                      {j.enabled ? "是" : "否"}
                    </button>
                  </td>
                  <td className="px-4 py-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => runNow(j.id)}
                      className="text-primary hover:underline text-xs"
                    >
                      立即运行
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(j.id)}
                      className="text-destructive hover:underline text-xs"
                    >
                      删除
                    </button>
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
