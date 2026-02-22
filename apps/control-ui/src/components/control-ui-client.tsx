"use client";

import { GatewayProvider } from "@/contexts/gateway-context";
import { Shell } from "./shell";

export function ControlUiClient() {
  return (
    <GatewayProvider>
      <Shell />
    </GatewayProvider>
  );
}
