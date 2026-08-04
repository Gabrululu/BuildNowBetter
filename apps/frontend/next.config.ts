import type { NextConfig } from "next";

// @coinbase/cdp-sdk (pulled in transitively by wagmi's Coinbase/Base Account connector, via
// RainbowKit's default wallet list) statically imports these as *optional* peer dependencies
// for its x402 payment features, which we never use. They're legitimately absent from
// node_modules; tell the bundler to treat them as empty modules instead of failing the build.
// See https://github.com/coinbase/cdp-sdk peerDependenciesMeta.
const X402_PACKAGES = [
  "@x402/core",
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm",
  "@x402/svm/exact/client",
  "@x402/extensions",
] as const;

const nextConfig: NextConfig = {
  transpilePackages: ["@buildnowbetter/shared"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(X402_PACKAGES.map((name) => [name, false])),
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      ...Object.fromEntries(X402_PACKAGES.map((name) => [name, "./lib/emptyModuleStub.ts"])),
    },
  },
};

export default nextConfig;
