// CesiumJS ships its workers, web workers, widget CSS, and texture assets
// as static files that need to live somewhere a browser can fetch them
// directly (Cesium loads them at runtime via CESIUM_BASE_URL, not through
// webpack imports). This copies them from node_modules into public/cesium
// on every install — including on Vercel's build machine — so the repo
// itself doesn't need to vendor a 23MB asset folder.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const source = join(projectRoot, "node_modules", "cesium", "Build", "Cesium");
const dest = join(projectRoot, "public", "cesium");

if (!existsSync(source)) {
  console.warn(`[copy-cesium-assets] Source not found at ${source} — skipping.`);
  process.exit(0);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

cpSync(source, dest, { recursive: true });
console.log(`[copy-cesium-assets] Copied Cesium static assets to ${dest}`);
