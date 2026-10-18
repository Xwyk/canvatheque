import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Cache Components / PPR désactivés : incompatibles avec la CSP à nonces (ADR-011).
  cacheComponents: false,
  serverExternalPackages: ["argon2", "pino", "pino-pretty"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/argon2/prebuilds/linux-*/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
