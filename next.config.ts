import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The dev badge and its "Compiling…" pill are burned into a screen recording
  // like anything else on the page. They are hidden only while filming, set by
  // the guide's Playwright config — during ordinary development, and during
  // `guide:check`, the indicator stays: it is what showed that a test was
  // failing on a route Next was still compiling, not on the product.
  devIndicators: process.env.GUIDE_RECORDING === "1" ? false : undefined,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content-Security-Policy is set per-request in src/proxy.ts (nonce-based,
          // SEC-8) — do not add a static CSP here or the two policies intersect.
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps for better stack traces in production
  widenClientFileUpload: true,

  // Tree-shake Sentry debug logging in production
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
