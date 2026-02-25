"use client";

import { Suspense } from "react";
import { ControlUiClient } from "@/components/control-ui-client";

function ControlUiFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">加载中…</p>
    </div>
  );
}

/**
 * Overview route: same app as home, so /overview and /overview?session=... work
 * when the gateway or user opens the control UI at /overview.
 */
export default function OverviewPage() {
  return (
    <Suspense fallback={<ControlUiFallback />}>
      <ControlUiClient />
    </Suspense>
  );
}
