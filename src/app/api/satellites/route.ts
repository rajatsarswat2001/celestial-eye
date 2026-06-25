import { NextResponse } from "next/server";

// CelesTrak publishes GP (General Perturbations) element sets at
// https://celestrak.org/NORAD/elements/gp.php and explicitly asks API
// consumers not to poll it on every page load — TLEs only get refreshed a
// handful of times a day upstream, and CelesTrak firewalls IPs that send
// repeated or invalid requests. We fetch once per server instance and cache
// in memory for a couple of hours, which matches the freshness window their
// own docs describe for this data.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// "active" is CelesTrak's curated group of currently-operating satellites.
// As of mid-2026 this is ~18,000 objects (mega-constellations like Starlink
// have grown it well past where it sat a few years ago) — large enough to
// give a rich "what's overhead" answer without pulling in 28,000+ debris
// objects that would dominate compute and add nothing to the radar's
// purpose. We request JSON directly: it's CelesTrak's native OMM (Orbit
// Mean-Elements Message) format, and satellite.js can parse OMM JSON
// straight from CelesTrak via json2satrec — no need to reconstruct legacy
// fixed-width TLE lines by hand.
const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON";

// Vercel serverless functions hard-cap response bodies at 4.5MB. CelesTrak's
// raw OMM JSON for ~18,000 active satellites — with every field, including
// several json2satrec never reads (OBJECT_ID, CCSDS_OMM_VERS, REF_FRAME,
// ELEMENT_SET_NO, etc.) — comes in well over that, which silently broke
// this route on Vercel (the response either got truncated or the function
// errored, and the client-side fetch/JSON.parse failure cascaded into the
// whole page crashing). We fix this two ways: strip every record down to
// only the ~12 fields json2satrec actually consumes, and cap the catalog
// size as a hard safety net regardless of how large the upstream group
// grows in the future.
const MAX_SATELLITES = 12000;

interface CelesTrakOmmRecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number | string;
  EPOCH: string;
  MEAN_MOTION: number | string;
  ECCENTRICITY: number | string;
  INCLINATION: number | string;
  RA_OF_ASC_NODE: number | string;
  ARG_OF_PERICENTER: number | string;
  MEAN_ANOMALY: number | string;
  BSTAR: number | string;
  MEAN_MOTION_DOT: number | string;
  MEAN_MOTION_DDOT: number | string;
}

const REQUIRED_FIELDS: (keyof CelesTrakOmmRecord)[] = [
  "OBJECT_NAME",
  "NORAD_CAT_ID",
  "EPOCH",
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "BSTAR",
  "MEAN_MOTION_DOT",
  "MEAN_MOTION_DDOT",
];

function slim(record: CelesTrakOmmRecord): CelesTrakOmmRecord {
  const out = {} as CelesTrakOmmRecord;
  for (const key of REQUIRED_FIELDS) {
    out[key] = record[key] as never;
  }
  return out;
}

let cache: { data: CelesTrakOmmRecord[]; fetchedAt: number } | null = null;

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      satellites: cache.data,
      cached: true,
      fetchedAt: cache.fetchedAt,
    });
  }

  try {
    const res = await fetch(CELESTRAK_URL, {
      headers: { "User-Agent": "ProjectZenith-CelestialEye/1.0 (hackathon submission)" },
      cache: "no-store",
    });

    if (!res.ok) {
      if (cache) {
        return NextResponse.json({
          satellites: cache.data,
          cached: true,
          stale: true,
          fetchedAt: cache.fetchedAt,
        });
      }
      return NextResponse.json(
        { error: "CelesTrak fetch failed", status: res.status },
        { status: 502 }
      );
    }

    const raw: CelesTrakOmmRecord[] = await res.json();
    let slimmed = raw.slice(0, MAX_SATELLITES).map(slim);

    // Hard safety net: even after capping object count and stripping unused
    // fields, re-check the actual serialized size before trusting our
    // estimate. If the catalog still doesn't fit comfortably under Vercel's
    // 4.5MB function response limit (we target 4MB to leave headroom for
    // the JSON wrapper), keep halving the slice until it does, rather than
    // shipping a response that silently breaks the page again.
    const SAFE_BYTES = 4 * 1024 * 1024;
    while (
      slimmed.length > 100 &&
      Buffer.byteLength(JSON.stringify(slimmed)) > SAFE_BYTES
    ) {
      slimmed = slimmed.slice(0, Math.floor(slimmed.length / 2));
    }

    cache = { data: slimmed, fetchedAt: now };
    return NextResponse.json({ satellites: slimmed, cached: false, fetchedAt: now });
  } catch (err) {
    if (cache) {
      return NextResponse.json({
        satellites: cache.data,
        cached: true,
        stale: true,
        fetchedAt: cache.fetchedAt,
      });
    }
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
