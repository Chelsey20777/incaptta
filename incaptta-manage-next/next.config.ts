import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: '/api/:path((?!super|inventory/map-csv|webhooks/resend).*)',
        destination: 'https://us-central1-incaptta-pro.cloudfunctions.net/api/api/:path*',
      },
    ];
  },
};

export default nextConfig;
