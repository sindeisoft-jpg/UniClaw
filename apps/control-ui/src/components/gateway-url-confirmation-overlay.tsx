"use client";

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

export function GatewayUrlConfirmationOverlay() {
  const {
    pendingGatewayUrl,
    confirmGatewayUrl,
    cancelGatewayUrl,
  } = useGateway();

  const open = Boolean(pendingGatewayUrl);

  if (!pendingGatewayUrl) return null;

  return (
    <Dialog open={open}>
      <DialogContent showClose={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>更换网关地址</DialogTitle>
          <DialogDescription>将重新连接到另一台网关服务器</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
          {pendingGatewayUrl}
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          仅在你信任该地址时确认。恶意地址可能危害你的系统。
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="default" onClick={confirmGatewayUrl}>
            确认
          </Button>
          <Button variant="outline" onClick={cancelGatewayUrl}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
