"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGateway } from "@/contexts/gateway-context";

type SessionEntry = {
  key: string;
  label?: string | null;
  thinkingLevel?: string | null;
  lastActiveAt?: number | null;
};

type SessionsResult = {
  sessions?: SessionEntry[];
  count?: number;
};

export function SessionsSection() {
  const pathname = usePathname();
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SessionsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState("120");

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<SessionsResult | undefined>("sessions.list", {
        limit: parseInt(limit, 10) || 120,
        includeGlobal: true,
        includeUnknown: false,
      });
      setResult(res ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected, limit]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  async function handleDelete(key: string) {
    if (!client || !connected || !confirm("确定删除该会话？")) return;
    try {
      await client.request("sessions.delete", { key, deleteTranscript: true });
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

  const sessions = result?.sessions ?? [];

  return (
    <div className="mt-4 space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span>数量</span>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
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
              <th className="px-4 py-2 text-left font-medium">会话 Key</th>
              <th className="px-4 py-2 text-left font-medium">标签</th>
              <th className="px-4 py-2 text-left font-medium">思考级别</th>
              <th className="px-4 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  暂无会话
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.key} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`${pathname}?session=${encodeURIComponent(s.key)}`}
                      className="text-primary hover:underline focus:outline-none focus:underline"
                    >
                      {s.key}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.label ?? "—"}</td>
                  <td className="px-4 py-2">{s.thinkingLevel ?? "—"}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(s.key)}
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
