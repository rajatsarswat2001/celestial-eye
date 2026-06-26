"use client";

import { useEffect, useState } from "react";
import type { SatCatInfo } from "@/lib/satcat";

// Shared module-level cache so hovering several satellites and then
// clicking one doesn't re-fetch anything we've already prefetched in this
// session — same idea as the server's per-ID cache, just on the client.
const clientCache = new Map<number, SatCatInfo>();
const inFlight = new Map<number, Promise<SatCatInfo | null>>();

async function fetchSatInfo(noradId: number): Promise<SatCatInfo | null> {
  const cached = clientCache.get(noradId);
  if (cached) return cached;

  const pending = inFlight.get(noradId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch(`/api/satinfo?id=${noradId}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.info) {
        clientCache.set(noradId, data.info as SatCatInfo);
        return data.info as SatCatInfo;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight.delete(noradId);
    }
  })();

  inFlight.set(noradId, request);
  return request;
}

// Exported so TrackedList can warm the cache on hover, before the user
// actually clicks to expand the panel — makes the expand feel instant on
// desktop while still working correctly as a plain click on mobile, where
// hover never fires.
export function prefetchSatInfo(noradId: number) {
  void fetchSatInfo(noradId);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</span>
      <span className="tabular truncate text-right text-xs text-ink">{value}</span>
    </div>
  );
}

export default function SatelliteDetail({ noradId }: { noradId: number }) {
  const [info, setInfo] = useState<SatCatInfo | null>(clientCache.get(noradId) ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    clientCache.has(noradId) ? "ready" : "loading"
  );

  useEffect(() => {
    if (clientCache.has(noradId)) return;

    let cancelled = false;

    fetchSatInfo(noradId).then((result) => {
      if (cancelled) return;
      if (result) {
        setInfo(result);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [noradId]);

  if (status === "loading") {
    return (
      <div className="border-t border-panel-edge/60 bg-void/40 px-4 py-3 font-mono text-[10px] text-grey">
        Looking up SATCAT record&hellip;
      </div>
    );
  }

  if (status === "error" || !info) {
    return (
      <div className="border-t border-panel-edge/60 bg-void/40 px-4 py-3 font-mono text-[10px] text-grey">
        No catalog record available for this object.
      </div>
    );
  }

  return (
    <div className="border-t border-panel-edge/60 bg-void/40 px-4 py-3">
      <Row label="Country / operator" value={info.ownerLabel} />
      <Row label="Object type" value={info.objectTypeDisplay} />
      <Row label="Status" value={info.opsStatusDisplay} />
      <Row label="Launched" value={info.launchDateDisplay} />
      {info.launchSite && <Row label="Launch site" value={info.launchSite} />}
      {info.intlDesignator && <Row label="Intl designator" value={info.intlDesignator} />}
      {info.periodMin !== null && (
        <Row label="Orbital period" value={`${info.periodMin.toFixed(1)} min`} />
      )}
      {info.apogeeKm !== null && info.perigeeKm !== null && (
        <Row
          label="Apogee / perigee"
          value={`${info.apogeeKm.toFixed(0)} / ${info.perigeeKm.toFixed(0)} km`}
        />
      )}
      {info.inclinationDeg !== null && (
        <Row label="Inclination" value={`${info.inclinationDeg.toFixed(1)}\u00b0`} />
      )}
      {info.rcsSize && <Row label="Size class" value={info.rcsSize} />}
      {info.decayDate && <Row label="Decayed" value={info.decayDate} />}
    </div>
  );
}
