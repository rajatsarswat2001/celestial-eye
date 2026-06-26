import { NextResponse } from "next/server";
import type { SatCatInfo } from "@/lib/satcat";

// SATCAT facts (owner, launch date, object type) are essentially static —
// they don't change run to run the way orbital elements do — so we cache
// each looked-up NORAD ID indefinitely for the life of the server instance
// rather than re-fetching on every hover/click. This also keeps us well
// inside CelesTrak's "don't hammer us per-client" politeness guidance,
// since real usage means a handful of distinct satellites get looked up
// per session, not the whole catalog.
const cache = new Map<number, SatCatInfo>();

interface CelesTrakSatCatRecord {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  NORAD_CAT_ID?: number | string;
  OBJECT_TYPE?: string;
  OPS_STATUS_CODE?: string;
  OWNER?: string;
  LAUNCH_DATE?: string;
  LAUNCH_SITE?: string;
  DECAY_DATE?: string;
  PERIOD?: number | string;
  INCLINATION?: number | string;
  APOGEE?: number | string;
  PERIGEE?: number | string;
  RCS?: number | string;
  RCS_SIZE?: string;
}

function toNum(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const noradId = Number(idParam);

  if (!idParam || !Number.isFinite(noradId) || noradId <= 0) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const cached = cache.get(noradId);
  if (cached) {
    return NextResponse.json({ info: cached, cached: true });
  }

  try {
    const res = await fetch(
      `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=JSON`,
      {
        headers: { "User-Agent": "ProjectZenith-CelestialEye/1.0 (hackathon submission)" },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "SATCAT fetch failed", status: res.status },
        { status: 502 }
      );
    }

    const raw: CelesTrakSatCatRecord[] = await res.json();
    const rec = raw[0];

    if (!rec) {
      return NextResponse.json({ error: "No SATCAT record found" }, { status: 404 });
    }

    const { ownerName, objectTypeLabel, opsStatusLabel, formatLaunchDate } = await import(
      "@/lib/satcat"
    );

    const info: SatCatInfo = {
      noradId,
      name: rec.OBJECT_NAME ?? `Object ${noradId}`,
      intlDesignator: rec.OBJECT_ID ?? null,
      owner: rec.OWNER ?? null,
      ownerLabel: ownerName(rec.OWNER),
      objectType: rec.OBJECT_TYPE ?? null,
      objectTypeDisplay: objectTypeLabel(rec.OBJECT_TYPE),
      launchDate: rec.LAUNCH_DATE ?? null,
      launchDateDisplay: formatLaunchDate(rec.LAUNCH_DATE),
      launchSite: rec.LAUNCH_SITE ?? null,
      decayDate: rec.DECAY_DATE ?? null,
      periodMin: toNum(rec.PERIOD),
      apogeeKm: toNum(rec.APOGEE),
      perigeeKm: toNum(rec.PERIGEE),
      inclinationDeg: toNum(rec.INCLINATION),
      rcsSize: rec.RCS_SIZE ?? (rec.RCS !== undefined ? String(rec.RCS) : null),
      opsStatus: rec.OPS_STATUS_CODE ?? null,
      opsStatusDisplay: opsStatusLabel(rec.OPS_STATUS_CODE),
    };

    cache.set(noradId, info);
    return NextResponse.json({ info, cached: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
