import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    // Disable webpack minimization in production to prevent the "Octal escape
    // is not permitted in strict mode" SyntaxError. This crash (confirmed via
    // browser DevTools) originates inside Cesium's vendored HTML-entity lookup
    // table, which contains the literal string '\240' (octal for NBSP). The
    // minifier's strict parser rejects this, producing a malformed chunk that
    // crashes every browser on load. Without minification the octal literal
    // survives untouched and browsers handle it correctly as legacy JS.
    // Trade-off: larger bundle. Fully acceptable for this use-case.
    if (!dev) {
      config.optimization.minimize = false;
    }

    config.resolve.fallback = { ...config.resolve.fallback, fs: false };

    // satellite.js ships an optional WASM-accelerated SGP4 path (multi/single
    // thread runtimes) behind dynamic imports that are never actually
    // invoked by the plain-JS functions we use (json2satrec, propagate,
    // gstime, etc.). The emscripten-generated loader files conditionally
    // `require` Node-only built-ins (node:module, node:worker_threads)
    // inside `if (isNode)` branches — but webpack statically scans for those
    // requires regardless of the runtime check, so the build fails even
    // though we never execute that branch in the browser. We alias the
    // loader files themselves away since we never call into this path.
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      [path.resolve(
        __dirname,
        "node_modules/satellite.js/wasm-build/pthreads-release/index.js"
      )]: false,
      [path.resolve(
        __dirname,
        "node_modules/satellite.js/wasm-build/base-release/index.js"
      )]: false,
    };

    return config;
  },
  async headers() {
    return [
      {
        source: "/cesium/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
