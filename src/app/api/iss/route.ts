import { NextResponse } from "next/server";

// Open Notify's ISS endpoint updates roughly once per few seconds upstream,
// but we still avoid hammering it on every client tick — every browser tab
// polling this directly would multiply load on a free public service with
// no auth and no published rate limit of its own. We refresh server-side on
// a short cache instead, which is enough for a radar UI that ticks every
// few seconds anyway (the ISS moves ~7.66 km/s, so even a 5s-old fix is
// accurate to within ~38km of travel, refined further by SGP4 propagation
// client-side using the ISS's own TLE from /api/satellites for the exact
// instant in between fetches).
const CACHE_TTL_MS = 5000;

const OPEN_NOTIFY_URL = "http://api.open-notify.org/iss-now.json";

interface OpenNotifyResponse {
  message: string;
  timestamp: number;
  iss_position: { latitude: string; longitude: string };
}

let cache: { lat: number; lon: number; timestamp: number; fetchedAt: number } | null = null;

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache, cached: true });
  }

  try {
    const res = await fetch(OPEN_NOTIFY_URL, { cache: "no-store" });
    if (!res.ok) {
      if (cache) return NextResponse.json({ ...cache, cached: true, stale: true });
      return NextResponse.json({ error: "Open Notify fetch failed" }, { status: 502 });
    }

    const data: OpenNotifyResponse = await res.json();
    cache = {
      lat: Number(data.iss_position.latitude),
      lon: Number(data.iss_position.longitude),
      timestamp: data.timestamp,
      fetchedAt: now,
    };

    return NextResponse.json({ ...cache, cached: false });
  } catch (err) {
    if (cache) return NextResponse.json({ ...cache, cached: true, stale: true });
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
