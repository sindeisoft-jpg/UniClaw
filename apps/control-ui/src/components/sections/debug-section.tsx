"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

export function DebugSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<unknown>(null);
  const [health, setHealth] = useState<unknown>(null);
  const [models, setModels] = useState<unknown[]>([]);
  const [heartbeat, setHeartbeat] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [callMethod, setCallMethod] = useState("");
  const [callParams, setCallParams] = useState("{}");
  const [callResult, setCallResult] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [s, h, m, lb] = await Promise.all([
        client.request<unknown>("status", {}),
        client.request<unknown>("health", {}),
        client.request<unknown[]>("models.list", {}),
        client.request<unknown>("last-heartbeat", {}),
      ]);
      setStatus(s);
      setHealth(h);
      setModels(Array.isArray(m) ? m : []);
      setHeartbeat(lb);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  async function handleCall() {
    if (!client || !connected || !callMethod.trim()) return;
    setCallResult(null);
    setCallError(null);
    let params: unknown;
    try {
      params = JSON.parse(callParams || "{}");
    } catch {
      setCallError("params 不是合法 JSON");
      return;
    }
    try {
      const res = await client.request(callMethod.trim(), params);
      setCallResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setCallError(String(e));
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">status</h3>
          <pre className="mt-2 max-h-40 overflow-auto text-xs">
            {status != null ? JSON.stringify(status, null, 2) : "—"}
          </pre>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">health</h3>
          <pre className="mt-2 max-h-40 overflow-auto text-xs">
            {health != null ? JSON.stringify(health, null, 2) : "—"}
          </pre>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground">models.list</h3>
        <pre className="mt-2 max-h-32 overflow-auto text-xs">
          {JSON.stringify(models, null, 2)}
        </pre>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground">last-heartbeat</h3>
        <pre className="mt-2 max-h-24 overflow-auto text-xs">
          {heartbeat != null ? JSON.stringify(heartbeat, null, 2) : "—"}
        </pre>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">手动 RPC 调用</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={callMethod}
            onChange={(e) => setCallMethod(e.target.value)}
            placeholder="方法名"
            className="w-48 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
          />
          <input
            type="text"
            value={callParams}
            onChange={(e) => setCallParams(e.target.value)}
            placeholder="请求参数（JSON，如 {}）"
            className="flex-1 min-w-32 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleCall}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            调用
          </button>
        </div>
        {callError && <p className="mt-2 text-sm text-destructive">{callError}</p>}
        {callResult != null && (
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs">
            {callResult}
          </pre>
        )}
      </div>
    </div>
  );
}
