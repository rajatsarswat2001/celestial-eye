import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled: Terser (the production minifier) chokes on a legacy octal
  // escape sequence somewhere inside Cesium's bundled credit/HTML-entity
  // handling (the same failure signature as a known Next.js/Cesium bug:
  // `Legacy octal escape is not permitted in strict mode | 'nbsp': '\240'`).
  // The minifier doesn't error out at build time here — it produces a
  // chunk containing a string that is invalid under strict mode, which then
  // throws `Uncaught SyntaxError: Octal escape` the instant a real browser
  // tries to parse that chunk, crashing the whole page. This reproduced
  // identically across desktop browsers, which is consistent with a
  // malformed bundle rather than a runtime/GPU issue. Until that one
  // problem string is tracked down and patched at the source, disabling
  // minification is the safe, verifiable fix — bundle size goes up, but
  // the page actually parses and runs.
  webpack: (config, { dev }) => {
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
