import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@buildnowbetter/shared"],
  webpack: (config) => {
    // @coinbase/cdp-sdk (pulled in transitively by wagmi's Coinbase/Base Account connector,
    // via RainbowKit's default wallet list) statically imports these as *optional* peer
    // dependencies for its x402 payment features, which we never use. They're legitimately
    // absent from node_modules; tell webpack to treat them as empty modules instead of failing
    // the build. See https://github.com/coinbase/cdp-sdk peerDependenciesMeta.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
      "@x402/extensions": false,
    };
    return config;
  },
};

export default nextConfig;
