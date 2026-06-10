import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow current Cloudflare quick tunnel to access dev resources (HMR, client chunks).
  allowedDevOrigins: ["choices-swap-saving-indicate.trycloudflare.com"],
};

export default nextConfig;
