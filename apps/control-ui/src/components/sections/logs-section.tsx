"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogLevel = (typeof LEVELS)[number];

type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
};

function parseMaybeJsonString(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeLevel(value: unknown): LogLevel | null {
  if (typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  return LEVELS.includes(lowered as LogLevel) ? (lowered as LogLevel) : null;
}

/** Gateway logs.tail returns { lines: string[] }. Parse like openclaw 2 controller (subsystem, level, message). */
function linesToEntries(lines: string[]): LogEntry[] {
  return lines.map((raw) => {
    if (!raw.trim()) return { raw, message: raw };
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const meta =
        obj && typeof obj._meta === "object" && obj._meta !== null
          ? (obj._meta as Record<string, unknown>)
          : null;
      const time =
        typeof obj.time === "string" ? obj.time : typeof meta?.date === "string" ? meta?.date : null;
      const level = normalizeLevel(meta?.logLevelName ?? meta?.level);

      const contextCandidate =
        typeof obj["0"] === "string" ? obj["0"] : typeof meta?.name === "string" ? meta?.name : null;
      const contextObj = parseMaybeJsonString(contextCandidate);
      let subsystem: string | null = null;
      if (contextObj) {
        if (typeof contextObj.subsystem === "string") subsystem = contextObj.subsystem;
        else if (typeof contextObj.module === "string") subsystem = contextObj.module;
      }
      if (!subsystem && contextCandidate && contextCandidate.length < 120) {
        subsystem = contextCandidate;
      }

      let message: string | null = null;
      if (typeof obj["1"] === "string") message = obj["1"];
      else if (!contextObj && typeof obj["0"] === "string") message = obj["0"];
      else if (typeof obj.message === "string") message = obj.message;

      return {
        raw,
        time,
        level,
        subsystem,
        message: message ?? raw,
      };
    } catch {
      return { raw, message: raw };
    }
  });
}

function matchesFilter(entry: LogEntry, needle: string): boolean {
  if (!needle) return true;
  const haystack = [entry.message, entry.subsystem, entry.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

const DEFAULT_LEVEL_FILTERS: Record<LogLevel, boolean> = {
  trace: true,
  debug: true,
  info: true,
  warn: true,
  error: true,
  fatal: true,
};

export function LogsSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit] = useState(200);
  const [maxBytes] = useState(250_000);
  const [autoFollow, setAutoFollow] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [levelFilters, setLevelFilters] = useState<Record<LogLevel, boolean>>(DEFAULT_LEVEL_FILTERS);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!client || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.request<{
        entries?: LogEntry[];
        lines?: string[];
        file?: string;
        truncated?: boolean;
      }>("logs.tail", { limit, maxBytes });
      if (Array.isArray(res?.entries) && res.entries.length > 0) {
        setEntries(
          res.entries.map((e) => {
            const entry = e as LogEntry & { raw?: string };
            return {
              ...entry,
              raw:
                entry.raw ??
                ([entry.time, entry.level, entry.subsystem, entry.message].filter(Boolean).join(" ") ||
                  JSON.stringify(e)),
            };
          }),
        );
      } else if (Array.isArray(res?.lines)) {
        setEntries(linesToEntries(res.lines));
      } else {
        setEntries([]);
      }
      if (typeof res?.file === "string") setFile(res.file);
      if (typeof res?.truncated === "boolean") setTruncated(res.truncated);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [client, connected, limit, maxBytes]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const needle = filterText.trim().toLowerCase();
  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (entry.level && !levelFilters[entry.level]) return false;
      return matchesFilter(entry, needle);
    });
  }, [entries, levelFilters, needle]);

  useEffect(() => {
    if (autoFollow && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered.length, autoFollow]);

  const handleLevelToggle = useCallback((level: LogLevel, enabled: boolean) => {
    setLevelFilters((prev) => ({ ...prev, [level]: enabled }));
  }, []);

  const exportLabel = needle || LEVELS.some((l) => !levelFilters[l]) ? "filtered" : "visible";
  const handleExport = useCallback(() => {
    const lines = filtered.map((e) => e.raw);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openclaw-logs-${exportLabel}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, exportLabel]);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {loading ? "加载中…" : "刷新"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            导出 {exportLabel === "filtered" ? "筛选结果" : "当前可见"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => setAutoFollow(e.target.checked)}
          />
          自动滚动到底部
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex min-w-[200px] flex-1 items-center gap-2 text-sm">
          <span className="shrink-0">筛选</span>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="搜索日志"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <label
            key={level}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
          >
            <input
              type="checkbox"
              checked={levelFilters[level]}
              onChange={(e) => handleLevelToggle(level, e.target.checked)}
              className="rounded"
            />
            <span
              className={
                level === "error"
                  ? "text-destructive"
                  : level === "warn"
                    ? "text-yellow-600 dark:text-yellow-400"
                    : level === "fatal"
                      ? "text-red-700 dark:text-red-400"
                      : ""
              }
            >
              {level}
            </span>
          </label>
        ))}
      </div>

      {file && (
        <p className="text-xs text-muted-foreground">文件：{file}</p>
      )}
      {truncated && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          日志输出已截断，仅显示最近一段。
        </div>
      )}

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted/30 font-mono text-xs p-2">
        {filtered.length === 0 ? (
          <p className="py-3 text-muted-foreground">无日志条目。</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_auto_auto_1fr] gap-2 border-b border-border/50 py-1 items-baseline"
              >
                <span className="shrink-0 text-muted-foreground">{formatTime(e.time)}</span>
                <span
                  className={
                    e.level === "error" || e.level === "fatal"
                      ? "text-destructive"
                      : e.level === "warn"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "shrink-0 text-muted-foreground"
                  }
                >
                  {e.level ?? ""}
                </span>
                <span className="shrink-0 truncate max-w-[120px] text-muted-foreground">
                  {e.subsystem ?? ""}
                </span>
                <span
                  className={
                    e.level === "error" || e.level === "fatal"
                      ? "text-destructive"
                      : e.level === "warn"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : ""
                  }
                >
                  {e.message ?? e.raw}
                </span>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
