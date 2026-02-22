"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function UsageSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [usageResult, setUsageResult] = useState<{ totalTokens?: number; sessionCount?: number } | null>(null);
  const [costResult, setCostResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [usage, cost] = await Promise.all([
        client.request<{ totalTokens?: number; sessionCount?: number }>("sessions.usage", {
          startDate,
          endDate,
        }),
        client.request<unknown>("usage.cost", { startDate, endDate }),
      ]);
      setUsageResult(usage ?? null);
      setCostResult(cost);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected, startDate, endDate]);

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
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span>开始日期</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>结束日期</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {loading ? "加载中…" : "查询"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">会话用量</h3>
          <p className="mt-2 text-2xl font-semibold">
            {usageResult?.totalTokens != null ? usageResult.totalTokens.toLocaleString() : "—"} tokens
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            会话数: {usageResult?.sessionCount ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">成本</h3>
          <pre className="mt-2 max-h-32 overflow-auto text-xs">
            {costResult != null ? JSON.stringify(costResult, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
