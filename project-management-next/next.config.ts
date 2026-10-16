import type { NextConfig } from "next";
import path from "path";
import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
} from "./src/lib/deployment-config";

const deploymentEnvironment = parseDeploymentEnvironment(process.env.DEPLOYMENT_ENV);
const defaultLegacyApi = deploymentEnvironment === 'staging'
  ? 'https://staging-api.incaptta.internal'
  : 'http://127.0.0.1:5001/demo-incaptta/us-central1/api';
const legacyApiBaseUrl = (process.env.LEGACY_API_BASE_URL || defaultLegacyApi).replace(/\/$/, '');
if (process.env.LEGACY_API_BASE_URL) {
  assertEnvironmentIsolation(deploymentEnvironment, { LEGACY_API_BASE_URL: legacyApiBaseUrl });
}

const buildVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.K_REVISION ||
  process.env.GITHUB_SHA ||
  process.env.APP_VERSION ||
  `build-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  env: {
    NEXT_PUBLIC_APP_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_DEPLOYMENT_ENV: deploymentEnvironment,
  },
  async rewrites() {
    return [
      {
        // Keep App Router API handlers on this backend. All remaining legacy
        // API paths continue to proxy to the Cloud Function.
        source: '/api/:path((?!super|inventory/map-csv|inventory/[^/]+/adjust|webhooks/resend|sessions|transfers|job-cards|subcontractors|crm).*)',
        destination: `${legacyApiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
