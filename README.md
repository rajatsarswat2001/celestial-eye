# Project Zenith — The Celestial Eye

A live cosmic radar. Pick any point on Earth and see exactly what's passing
through that location's zenith right now — the ISS, active satellites, the
Sun, Moon, and naked-eye planets — rendered on a 3D globe with a telemetry
HUD overlay.

Built for AstralWeb Innovate Round 2.

## What it does

- **Interactive 3D Globe**: Built on CesiumJS, featuring a highly optimized CARTO Dark Matter base map that performs smoothly on any device.
- **Searchable Live Catalog**: A left sidebar lists the entire active satellite catalog. It can be filtered by categories like Starlink or the ISS, and searched by name or NORAD ID.
- **Proximity Sorting**: Tap anywhere on the Earth, and the catalog instantly re-sorts to show you exactly which satellites are closest to that specific location!
- **Real-Time Telemetry**: Clicking a satellite opens a right sidebar displaying its live Altitude, Velocity, Inclination, Orbital Period, and Ground Track.
- **Visual Target Locks**: Selected satellites are highlighted in brilliant **Neon Pink** with a glowing orbital trail and a "TARGET LOCKED" label, making tracking intuitive.
- **Mobile Responsive**: The entire dashboard collapses cleanly on mobile devices. The sidebars convert into toggleable sliding drawers so the globe is always front-and-center.

## How it works

| Concern | Approach |
|---|---|
| 3D globe & coordinate picking | [CesiumJS](https://cesium.com/platform/cesiumjs/) via [Resium](https://resium.reearth.io/) |
| Base map tiles | [CARTO Dark Matter](https://github.com/CartoDB/basemap-styles) (free, keyless, OSM-derived) |
| Satellites (ISS + active (~12,000-object cap)) | [CelesTrak](https://celestrak.org) GP/OMM element sets, propagated client-side with [satellite.js](https://github.com/shashwatak/satellite.js) (SGP4) |
| Sun, Moon, planets | [astronomy-engine](https://github.com/cosinekitty/astronomy-engine), computed client-side |
| Live ISS fix | [Open Notify](http://open-notify.org/Open-Notify-API/ISS-Location-Now/) |

### A deliberate substitution: astronomy-engine instead of NASA Horizons

The brief calls out NASA Horizons for celestial body positions. Horizons is
built for batch/file-based ephemeris queries — it's not designed to be
polled every couple of seconds as a user drags a coordinate picker, and its
public interface rate-limits aggressively. `astronomy-engine` implements the
same class of analytic perturbation models Horizons itself is validated
against (VSOP-derived planetary theory, ELP-2000-class lunar theory), is
accurate to a fraction of an arcminute for the Sun, Moon, and planets on
human timescales, and runs instantly in the browser with **zero network
dependency and zero rate limit**. For a live "what's overhead right now"
radar, this is both more accurate in practice (no stale cache, no failed
request) and the more honest engineering choice.

### Why two server-side API routes exist

`/api/satellites` and `/api/iss` are thin proxies, not pass-through fetches:

- **CelesTrak** explicitly asks API consumers not to poll on every page
  load — their TLE/OMM data only refreshes a few times a day, and they
  firewall IPs that hammer the endpoint. `/api/satellites` fetches once per
  server instance and caches the active-satellite catalog (capped at 12,000 objects, with fields trimmed to only what SGP4 needs)
  in memory for 2 hours.
- **Open Notify** has no published rate limit but also no auth — every
  browser tab polling it directly would multiply load on a free public
  service for no benefit, since the ISS's own TLE (already in the satellite
  catalog) lets us propagate its exact position client-side between fixes
  anyway. `/api/iss` caches for 5 seconds.

Both routes serve the last good cached value if the upstream fetch fails,
so a transient outage degrades gracefully instead of breaking the UI.

### The HUD aesthetic

This is built to look like a premium, modern tracking-station dashboard. We completely overhauled the UI using a dark void background (`#060C16`), phosphor-cyan accents (`#27e1c1`), and bright neon pink (`#FF0055`) for active target locking. Monospace tabular numerals are used throughout the telemetry readouts for a high-tech sci-fi aesthetic. The layout is fully responsive, utilizing Tailwind CSS grids to adapt flawlessly to both ultra-wide desktop monitors and mobile phone screens.

### Why satellite records are trimmed to 12 fields and capped at 12,000

Vercel serverless functions hard-cap response bodies at 4.5MB. CelesTrak's
"active satellites" group has grown to roughly 18,000 objects as of mid-2026
(mega-constellation growth, mainly Starlink) — passing through every OMM
field for all of them landed right at that ceiling and intermittently broke
the deployed site outright (the page would load its shell, then the
`/api/satellites` response would get cut off, and the resulting parse
failure cascaded into a hard crash rather than a catchable error). The fix:
strip every record down to the ~12 fields `json2satrec` actually reads,
which on their own come in well under the limit, plus a runtime safety net
that re-checks the real serialized size and shrinks the catalog further if
it's ever still too close to the limit — so this can't silently break again
if the catalog keeps growing.

### Why minification is disabled in production

The deployed site initially crashed on every browser and device with
`Uncaught SyntaxError: Octal escape`, immediately followed by a
`ChunkLoadError`. That's a parse-time failure, not a runtime one — Terser
(Next's default production minifier) produced a chunk containing a legacy
octal escape sequence (most likely from an HTML-entity lookup table inside
Cesium's bundled credit/label-rendering code, e.g. `'nbsp': '\240'`-style
entries), which is invalid under strict mode and JS modules are always
strict. The browser couldn't parse that chunk at all, so it never
registered with webpack's module system, and the very next chunk that
depended on it failed to load — which is why the page rendered its initial
shell for a moment and then died identically everywhere, regardless of
device or GPU.

This was confirmed directly: building with minification on, every produced
`.js` chunk was checked with `node --check`, and the build is set up so this
class of bug can't silently ship again — minification is off, and every
chunk has been verified to parse cleanly. The tradeoff is a larger
JS payload (Cesium dominates this either way), which is an acceptable
cost for a deadline fix; pinpointing and patching the exact source string
inside Cesium's vendored bundle would be the cleaner long-term fix.

## Setup

```bash
npm install   # also copies Cesium's static assets into public/cesium
npm run dev   # http://localhost:3000
```

```bash
npm run build
npm run start
```

**No API keys required.** Every data source used — CelesTrak, Open Notify,
CARTO's basemap tiles, and astronomy-engine's local computation — is free
and keyless. (Cesium ion is explicitly *not* used, which is why no Ion
access token is needed either — the base map comes from CARTO instead.)

### Why `npm run dev`/`build` pass `--webpack`

Next.js 16 defaults to Turbopack. CesiumJS's static-asset loading pattern
(workers, web workers, and widget assets resolved at runtime via
`CESIUM_BASE_URL`, copied out of `node_modules` by
`scripts/copy-cesium-assets.mjs` on every install) is webpack-oriented, so
this project pins to webpack explicitly via the `--webpack` flag in
`package.json`'s scripts.

## Project structure

```
src/
  app/
    page.tsx              — main view: globe + HUD + tracked-object panel
    api/satellites/route.ts — cached CelesTrak proxy
    api/iss/route.ts        — cached Open Notify proxy
  components/
    Globe.tsx              — Cesium viewer, click-to-pick, rendering targets and trails
  lib/
    celestial.ts            — Sun/Moon/planet positions (astronomy-engine)
    satellites.ts            — TLE propagation & look angles (satellite.js)
scripts/
  copy-cesium-assets.mjs   — postinstall: vendors Cesium's static assets
```

## Known limitations

- The active-satellite catalog (capped at 12,000 objects) is propagated entirely in
  the browser on each tick. This is fast in practice (SGP4 per object is
  cheap), but very low-end devices may notice it.
- A handful of TLEs in any given CelesTrak catalog snapshot are stale or
  malformed (decayed objects, fresh launches without settled elements).
  Propagation failures for individual objects are caught and skipped rather
  than surfaced, so the satellite count shown is "what we could
  successfully propagate," not the full catalog size.
