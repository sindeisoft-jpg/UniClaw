"use client";

import { useCallback, useEffect, useState } from "react";
import { useGateway } from "@/contexts/gateway-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type CronJob = {
  id: string;
  name?: string;
  schedule?: unknown;
  payload?: unknown;
  enabled?: boolean;
};
type CronStatus = { nextWakeAtMs?: number };

type ScheduleKind = "at" | "every" | "cron";
type SessionTarget = "main" | "isolated";
type WakeMode = "next-heartbeat" | "now";
type PayloadKind = "systemEvent" | "agentTurn";
type DeliveryMode = "none" | "announce";

type CronFormState = {
  name: string;
  description: string;
  scheduleKind: ScheduleKind;
  scheduleAt: string;
  everyAmount: string;
  everyUnit: "minutes" | "hours" | "days";
  cronExpr: string;
  cronTz: string;
  sessionTarget: SessionTarget;
  wakeMode: WakeMode;
  payloadKind: PayloadKind;
  payloadText: string;
  deliveryMode: DeliveryMode;
  deliveryChannel: string;
  deliveryTo: string;
  enabled: boolean;
};

const DEFAULT_CRON_FORM: CronFormState = {
  name: "",
  description: "",
  scheduleKind: "every",
  scheduleAt: "",
  everyAmount: "30",
  everyUnit: "minutes",
  cronExpr: "0 7 * * *",
  cronTz: "",
  sessionTarget: "isolated",
  wakeMode: "now",
  payloadKind: "agentTurn",
  payloadText: "",
  deliveryMode: "announce",
  deliveryChannel: "last",
  deliveryTo: "",
  enabled: true,
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function buildSchedule(form: CronFormState) {
  if (form.scheduleKind === "at") {
    const ms = Date.parse(form.scheduleAt);
    if (!Number.isFinite(ms)) throw new Error("请填写有效的运行时间");
    return { kind: "at" as const, at: new Date(ms).toISOString() };
  }
  if (form.scheduleKind === "every") {
    const amount = parseInt(form.everyAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("请填写有效的间隔数值");
    const mult =
      form.everyUnit === "minutes"
        ? 60_000
        : form.everyUnit === "hours"
          ? 3_600_000
          : 86_400_000;
    return { kind: "every" as const, everyMs: amount * mult };
  }
  const expr = form.cronExpr.trim();
  if (!expr) throw new Error("请填写 cron 表达式");
  return {
    kind: "cron" as const,
    expr,
    tz: form.cronTz.trim() || undefined,
  };
}

function buildPayload(form: CronFormState) {
  if (form.payloadKind === "systemEvent") {
    const text = form.payloadText.trim();
    if (!text) throw new Error("请填写系统事件内容");
    return { kind: "systemEvent" as const, text };
  }
  const message = form.payloadText.trim();
  if (!message) throw new Error("请填写智能体消息");
  return { kind: "agentTurn" as const, message };
}

export function CronSection() {
  const { client, connected } = useGateway();
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CronFormState>(DEFAULT_CRON_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  function openCreate() {
    setForm(DEFAULT_CRON_FORM);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!client || !connected || createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const schedule = buildSchedule(form);
      const payload = buildPayload(form);
      const name = form.name.trim();
      if (!name) {
        setCreateError("请填写任务名称");
        return;
      }
      const delivery =
        form.sessionTarget === "isolated" && form.payloadKind === "agentTurn" && form.deliveryMode
          ? {
              mode: form.deliveryMode as "none" | "announce",
              channel:
                form.deliveryChannel.trim() || "last",
              to: form.deliveryTo.trim() || undefined,
            }
          : undefined;
      const job = {
        name,
        description: form.description.trim() || undefined,
        enabled: form.enabled,
        schedule,
        sessionTarget: form.sessionTarget,
        wakeMode: form.wakeMode,
        payload,
        delivery,
      };
      await client.request("cron.add", job);
      setCreateOpen(false);
      await load();
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateBusy(false);
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
        <Button type="button" variant="default" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          创建定时任务
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">名称 / ID</th>
              <th className="px-4 py-2 text-left font-medium">启用</th>
              <th className="px-4 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  暂无定时任务，点击「创建定时任务」添加
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span className="font-medium">{j.name || j.id}</span>
                    {j.name && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{j.id}</span>
                    )}
                    {!j.name && <span className="font-mono text-xs">{j.id}</span>}
                  </td>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>创建定时任务</DialogTitle>
          </DialogHeader>
          {createError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">任务名称 *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：每日早报"
                className={inputClass}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">说明（可选）</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="任务说明"
                className={inputClass}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">执行方式</label>
              <select
                value={form.scheduleKind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduleKind: e.target.value as ScheduleKind }))
                }
                className={inputClass}
              >
                <option value="at">指定时间（一次性）</option>
                <option value="every">按间隔</option>
                <option value="cron">Cron 表达式</option>
              </select>
            </div>
            {form.scheduleKind === "at" && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">运行时间</label>
                <Input
                  type="datetime-local"
                  value={form.scheduleAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduleAt: e.target.value }))}
                  className={inputClass}
                />
              </div>
            )}
            {form.scheduleKind === "every" && (
              <div className="flex gap-2 items-end">
                <div className="grid gap-2 flex-1">
                  <label className="text-sm font-medium">间隔</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.everyAmount}
                    onChange={(e) => setForm((f) => ({ ...f, everyAmount: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-2 flex-1">
                  <label className="text-sm font-medium">单位</label>
                  <select
                    value={form.everyUnit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, everyUnit: e.target.value as "minutes" | "hours" | "days" }))
                    }
                    className={inputClass}
                  >
                    <option value="minutes">分钟</option>
                    <option value="hours">小时</option>
                    <option value="days">天</option>
                  </select>
                </div>
              </div>
            )}
            {form.scheduleKind === "cron" && (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Cron 表达式</label>
                  <Input
                    value={form.cronExpr}
                    onChange={(e) => setForm((f) => ({ ...f, cronExpr: e.target.value }))}
                    placeholder="0 7 * * *"
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">时区（可选）</label>
                  <Input
                    value={form.cronTz}
                    onChange={(e) => setForm((f) => ({ ...f, cronTz: e.target.value }))}
                    placeholder="America/Los_Angeles"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <label className="text-sm font-medium">会话</label>
              <select
                value={form.sessionTarget}
                onChange={(e) => {
                  const v = e.target.value as SessionTarget;
                  setForm((f) => ({
                    ...f,
                    sessionTarget: v,
                    payloadKind: v === "main" ? "systemEvent" : f.payloadKind,
                  }));
                }}
                className={inputClass}
              >
                <option value="main">主会话（仅支持系统事件）</option>
                <option value="isolated">隔离会话（支持智能体消息）</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">唤醒</label>
              <select
                value={form.wakeMode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wakeMode: e.target.value as WakeMode }))
                }
                className={inputClass}
              >
                <option value="now">立即唤醒</option>
                <option value="next-heartbeat">下次心跳时</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">任务内容类型</label>
              <select
                value={form.payloadKind}
                onChange={(e) => {
                  const v = e.target.value as PayloadKind;
                  setForm((f) => ({
                    ...f,
                    payloadKind: v,
                    sessionTarget: v === "systemEvent" ? "main" : "isolated",
                  }));
                }}
                className={inputClass}
              >
                <option value="systemEvent">系统事件（主会话）</option>
                <option value="agentTurn">智能体消息（隔离会话）</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {form.payloadKind === "systemEvent" ? "系统事件内容 *" : "智能体消息 *"}
              </label>
              <Textarea
                value={form.payloadText}
                onChange={(e) => setForm((f) => ({ ...f, payloadText: e.target.value }))}
                placeholder={
                  form.payloadKind === "systemEvent"
                    ? "注入到主会话的系统文本"
                    : "发给智能体的提示词"
                }
                rows={3}
                className="min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {form.sessionTarget === "isolated" && form.payloadKind === "agentTurn" && (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">投递</label>
                  <select
                    value={form.deliveryMode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, deliveryMode: e.target.value as DeliveryMode }))
                    }
                    className={inputClass}
                  >
                    <option value="announce">公布摘要</option>
                    <option value="none">不投递</option>
                  </select>
                </div>
                {form.deliveryMode === "announce" && (
                  <>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">渠道</label>
                      <Input
                        value={form.deliveryChannel}
                        onChange={(e) => setForm((f) => ({ ...f, deliveryChannel: e.target.value }))}
                        placeholder="last"
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">收件人</label>
                      <Input
                        value={form.deliveryTo}
                        onChange={(e) => setForm((f) => ({ ...f, deliveryTo: e.target.value }))}
                        placeholder="可选"
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cron-enabled"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="cron-enabled" className="text-sm font-medium">
                创建后启用
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleCreate} disabled={createBusy}>
              {createBusy ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
