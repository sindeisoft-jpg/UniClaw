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

export default function Home() {
  return (
    <Suspense fallback={<ControlUiFallback />}>
      <ControlUiClient />
    </Suspense>
  );
}
