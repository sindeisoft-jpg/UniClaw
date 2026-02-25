"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SessionsUsageResult = {
  totals?: { totalTokens?: number; totalCost?: number; input?: number; output?: number };
  sessions?: unknown[];
  startDate?: string;
  endDate?: string;
};

type CostUsageSummary = {
  updatedAt?: number;
  days?: number;
  totals?: {
    totalTokens?: number;
    totalCost?: number;
    input?: number;
    output?: number;
    inputCost?: number;
    outputCost?: number;
  };
  daily?: Array<{
    date?: string;
    input?: number;
    output?: number;
    totalTokens?: number;
    totalCost?: number;
  }>;
};

export function UsageSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());
  const [usageResult, setUsageResult] = useState<SessionsUsageResult | null>(null);
  const [costResult, setCostResult] = useState<CostUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [usage, cost] = await Promise.all([
        client.request<SessionsUsageResult>("sessions.usage", {
          startDate,
          endDate,
        }),
        client.request<CostUsageSummary>("usage.cost", { startDate, endDate }),
      ]);
      setUsageResult(usage ?? null);
      setCostResult(cost ?? null);
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

  const totals = usageResult?.totals;
  const sessionCount = usageResult?.sessions?.length ?? 0;
  const totalTokens = totals?.totalTokens ?? 0;
  const costTotals = costResult?.totals;
  const costDaily = costResult?.daily ?? [];

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
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>结束日期</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <Button type="button" onClick={load} disabled={loading} variant="secondary">
          {loading ? "加载中…" : "查询"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">会话用量</CardTitle>
            <p className="text-sm text-muted-foreground">
              {usageResult?.startDate && usageResult?.endDate
                ? `${usageResult.startDate} 至 ${usageResult.endDate}`
                : "选定日期范围内的汇总"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">总 Token 数</p>
              <p className="text-2xl font-semibold tabular-nums">
                {usageResult ? totalTokens.toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">会话数</p>
              <p className="text-2xl font-semibold tabular-nums">
                {usageResult ? sessionCount.toLocaleString() : "—"}
              </p>
            </div>
            {totals && (totals.input != null || totals.output != null) && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">输入</p>
                  <p className="font-medium tabular-nums">{(totals.input ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">输出</p>
                  <p className="font-medium tabular-nums">{(totals.output ?? 0).toLocaleString()}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">成本</CardTitle>
            <p className="text-sm text-muted-foreground">
              {costResult?.updatedAt
                ? `更新于 ${new Date(costResult.updatedAt).toLocaleString()}`
                : "选定日期范围内的成本汇总"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {costTotals && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">总 Token</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {(costTotals.totalTokens ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">总成本</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {typeof costTotals.totalCost === "number"
                      ? `$${costTotals.totalCost.toFixed(4)}`
                      : "—"}
                  </p>
                </div>
                {(costTotals.input != null || costTotals.output != null) && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">输入</p>
                      <p className="text-sm font-medium tabular-nums">
                        {(costTotals.input ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">输出</p>
                      <p className="text-sm font-medium tabular-nums">
                        {(costTotals.output ?? 0).toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
            {!costResult && !loading && (
              <p className="text-sm text-muted-foreground">暂无成本数据</p>
            )}
            {costDaily.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">按日统计</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">日期</th>
                        <th className="px-3 py-2 text-right font-medium">输入</th>
                        <th className="px-3 py-2 text-right font-medium">输出</th>
                        <th className="px-3 py-2 text-right font-medium">Token</th>
                        <th className="px-3 py-2 text-right font-medium">成本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costDaily
                        .slice()
                        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
                        .slice(0, 14)
                        .map((row) => (
                          <tr key={row.date ?? ""} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{row.date ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {(row.input ?? 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {(row.output ?? 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {(row.totalTokens ?? (row.input ?? 0) + (row.output ?? 0)).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {typeof row.totalCost === "number"
                                ? `$${row.totalCost.toFixed(4)}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {costDaily.length > 14 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    仅显示最近 14 天，共 {costDaily.length} 天
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
