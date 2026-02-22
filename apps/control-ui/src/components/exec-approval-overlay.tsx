"use client";

import { useState, useCallback } from "react";
import { useGateway } from "@/contexts/gateway-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GatewayClient } from "@/lib/gateway-client";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时`;
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono truncate max-w-[240px]" title={value}>
        {value}
      </span>
    </div>
  );
}

/** Set gateway config tools.exec.ask=off and tools.exec.security=full via patch so exec no longer prompts. */
async function setConfigExecNoPrompt(client: GatewayClient): Promise<void> {
  const res = await client.request<{ hash?: string }>("config.get", {});
  const hash = res?.hash;
  if (!hash) {
    throw new Error("无法读取网关配置（请先在「配置」页保存一次配置后再试）");
  }
  const patch = {
    tools: {
      exec: {
        ask: "off",
        security: "full",
      },
    },
  };
  await client.request("config.patch", {
    raw: JSON.stringify(patch),
    baseHash: hash,
  });
}

/** Set exec-approvals defaults to ask=off, security=full so host no longer prompts. */
async function setExecApprovalsNoPrompt(client: GatewayClient): Promise<void> {
  const res = await client.request<{
    hash?: string;
    file?: { version?: number; defaults?: Record<string, unknown>; agents?: Record<string, unknown> };
  }>("exec.approvals.get", {});
  const file = res?.file;
  const hash = res?.hash;
  const next: {
    version: 1;
    defaults: { ask: string; security: string };
    agents?: Record<string, unknown>;
  } = {
    version: 1,
    defaults: { ...(file?.defaults && typeof file.defaults === "object" ? file.defaults : {}), ask: "off", security: "full" },
  };
  if (file?.agents && typeof file.agents === "object") next.agents = file.agents;
  const params: { file: typeof next; baseHash?: string } = { file: next };
  if (hash) params.baseHash = hash;
  await client.request("exec.approvals.set", params);
}

export function ExecApprovalOverlay() {
  const {
    client,
    connected,
    execApprovalQueue,
    execApprovalBusy,
    execApprovalError,
    handleExecApprovalDecision,
  } = useGateway();
  const [disablingPrompts, setDisablingPrompts] = useState(false);
  const [disablePromptsError, setDisablePromptsError] = useState<string | null>(null);

  const active = execApprovalQueue[0];
  const open = Boolean(active);

  const handleDisablePromptsAndAllow = useCallback(async () => {
    if (!client || !connected || !active) return;
    if (!window.confirm("将关闭所有执行审批提示（系统级），并允许此次命令。之后智能体执行命令将不再弹窗。是否继续？")) return;
    setDisablingPrompts(true);
    setDisablePromptsError(null);
    const errors: string[] = [];
    try {
      try {
        await setConfigExecNoPrompt(client);
      } catch (e) {
        errors.push(`网关配置: ${String(e)}`);
      }
      await setExecApprovalsNoPrompt(client);
      await handleExecApprovalDecision("allow-once");
      if (errors.length > 0) {
        setDisablePromptsError(
          "已关闭审批弹窗（exec-approvals），但网关 config 更新失败：" + errors.join("；") + "。建议在「配置」页修复后再次点击「不再询问」以完全关闭询问。",
        );
      }
    } catch (e) {
      setDisablePromptsError(String(e));
    } finally {
      setDisablingPrompts(false);
    }
  }, [client, connected, active, handleExecApprovalDecision]);

  if (!active) return null;

  const request = active.request;
  const remainingMs = active.expiresAtMs - Date.now();
  const remaining =
    remainingMs > 0 ? `剩余 ${formatRemaining(remainingMs)} 过期` : "已过期";
  const queueCount = execApprovalQueue.length;
  const busy = execApprovalBusy || disablingPrompts;

  return (
    <Dialog open={open}>
      <DialogContent showClose={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>需要执行审批</DialogTitle>
          <DialogDescription>{remaining}</DialogDescription>
          {queueCount > 1 && (
            <p className="text-xs text-muted-foreground">{queueCount} 条待处理</p>
          )}
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
          {request.command}
        </div>
        <div className="grid gap-1.5 text-sm">
          <MetaRow label="主机" value={request.host ?? undefined} />
          <MetaRow label="智能体" value={request.agentId ?? undefined} />
          <MetaRow label="会话" value={request.sessionKey ?? undefined} />
          <MetaRow label="工作目录" value={request.cwd ?? undefined} />
          <MetaRow label="解析路径" value={request.resolvedPath ?? undefined} />
          <MetaRow label="安全策略" value={request.security ?? undefined} />
          <MetaRow label="询问策略" value={request.ask ?? undefined} />
        </div>
        {(execApprovalError || disablePromptsError) && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {execApprovalError ?? disablePromptsError}
          </div>
        )}
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <div className="w-full sm:w-auto order-last sm:order-none">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={busy}
              onClick={handleDisablePromptsAndAllow}
            >
              {disablingPrompts ? "设置中…" : "不再询问（系统级）"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">关闭后所有命令将自动放行，不再弹窗</p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" disabled={busy} onClick={() => handleExecApprovalDecision("allow-once")}>
              允许一次
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => handleExecApprovalDecision("allow-always")}>
              始终允许
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => handleExecApprovalDecision("deny")}>
              拒绝
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
