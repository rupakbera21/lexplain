import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mammoth runs server-side only
  serverExternalPackages: ["mammoth"],

  // Disable x-powered-by header (minor security hygiene)
  poweredByHeader: false,

  // Headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
