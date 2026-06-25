import { NextResponse } from "next/server";

// CelesTrak publishes GP (General Perturbations) element sets at
// https://celestrak.org/NORAD/elements/gp.php and explicitly asks API
// consumers not to poll it on every page load — TLEs only get refreshed a
// handful of times a day upstream, and CelesTrak firewalls IPs that send
// repeated or invalid requests. We fetch once per server instance and cache
// in memory for a couple of hours, which matches the freshness window their
// own docs describe for this data.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// "active" is CelesTrak's curated group of ~8000 currently operating
// satellites — large enough to give a rich "what's overhead" answer without
// pulling in 30,000+ pieces of debris that would dominate compute and add
// nothing to the radar's purpose. We request JSON directly: it's CelesTrak's
// native OMM (Orbit Mean-Elements Message) format, and satellite.js can
// parse OMM JSON straight from CelesTrak via json2satrec — no need to
// reconstruct legacy fixed-width TLE lines by hand.
const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON";

let cache: { data: unknown[]; fetchedAt: number } | null = null;

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

    const raw: unknown[] = await res.json();
    cache = { data: raw, fetchedAt: now };
    return NextResponse.json({ satellites: raw, cached: false, fetchedAt: now });
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
