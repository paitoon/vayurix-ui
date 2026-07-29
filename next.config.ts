import type { NextConfig } from "next";

// On-prem console served next to the Rust API. No edge runtime, no build-time data access:
// everything rendered comes from /api/vayurix/* at request time.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
