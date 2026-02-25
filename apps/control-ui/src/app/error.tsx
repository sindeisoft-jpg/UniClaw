"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches client-side exceptions in this segment (e.g. overview/channels section).
 * Shows a friendly message and lets the user try again.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Control UI client error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">页面加载出错</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        发生客户端异常。请查看浏览器控制台了解详情，或点击下方按钮重试。
      </p>
      {error.message && (
        <pre className="max-h-32 max-w-full overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <Button onClick={reset} variant="outline">
        重试
      </Button>
    </div>
  );
}
