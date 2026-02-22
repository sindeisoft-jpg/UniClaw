import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.OPENCLAW_CONTROL_UI_BASE_PATH || "",
  assetPrefix: process.env.OPENCLAW_CONTROL_UI_BASE_PATH || undefined,
};

export default nextConfig;
