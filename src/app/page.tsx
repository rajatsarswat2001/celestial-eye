"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RadarSweep, { type RadarBlip } from "@/components/RadarSweep";
import TrackedList from "@/components/TrackedList";
import type { PickedCoordinate } from "@/components/Globe";
import { computeCelestialBodies, type SkyObject } from "@/lib/celestial";
import { findOverheadSatellites, type SatellitePosition, type TleRecord } from "@/lib/satellites";

// Cesium touches `window` at module load time, so the globe can only render
// client-side. ssr:false keeps Next from trying to render it on the server.
const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

const TICK_MS = 2000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000; // matches server cache TTL
const ISS_REFRESH_MS = 5000;

function zenithFraction(altitudeDeg: number): number {
  return Math.max(0, Math.min(1, altitudeDeg / 90));
}

export default function Home() {
  const [picked, setPicked] = useState<PickedCoordinate | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [satCatalog, setSatCatalog] = useState<TleRecord[]>([]);
  const [issRaw, setIssRaw] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");

  const tickRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const res = await fetch("/api/satellites");
        const data = await res.json();
        if (!cancelled && Array.isArray(data.satellites)) {
          setSatCatalog(data.satellites);
        }
      } catch {
        // Network hiccup — keep whatever catalog we already have and let
        // the next interval retry.
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    }

    loadCatalog();
    const interval = window.setInterval(loadCatalog, SATELLITE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadIss() {
      try {
        const res = await fetch("/api/iss");
        const data = await res.json();
        if (!cancelled && typeof data.lat === "number") {
          setIssRaw({ lat: data.lat, lon: data.lon });
        }
      } catch {
        // keep last known position
      }
    }

    loadIss();
    const interval = window.setInterval(loadIss, ISS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const celestialBodies: SkyObject[] = useMemo(() => {
    if (!picked) return [];
    return computeCelestialBodies(picked.lat, picked.lon, now);
  }, [picked, now]);

  const overheadSatellites: SatellitePosition[] = useMemo(() => {
    if (!picked || satCatalog.length === 0) return [];
    return findOverheadSatellites(satCatalog, picked.lat, picked.lon, now, 0);
  }, [picked, satCatalog, now]);

  const trackedObjects = useMemo(() => {
    const combined = [...celestialBodies, ...overheadSatellites.slice(0, 60)];
    combined.sort((a, b) => a.zenithAngleDeg - b.zenithAngleDeg);
    return combined;
  }, [celestialBodies, overheadSatellites]);

  const radarBlips: RadarBlip[] = useMemo(() => {
    return trackedObjects
      .filter((o) => o.altitudeDeg > 0)
      .map((o) => ({
        id: o.id,
        azimuthDeg: o.azimuthDeg,
        elevationFrac: zenithFraction(o.altitudeDeg),
        color:
          o.kind === "iss"
            ? "#ff8a3d"
            : o.kind === "sun"
              ? "#ffd76a"
              : o.kind === "moon"
                ? "#e8ecf1"
                : o.kind === "planet"
                  ? "#27e1c1"
                  : "#5b6b82",
        pulse: o.id === selectedId,
      }));
  }, [trackedObjects, selectedId]);

  const satelliteBlips = useMemo(
    () =>
      overheadSatellites.slice(0, 200).map((s) => ({
        id: s.id,
        lat: s.subLat,
        lon: s.subLon,
        isIss: s.kind === "iss",
      })),
    [overheadSatellites]
  );

  const handlePick = useCallback((coord: PickedCoordinate) => {
    setPicked(coord);
    setSelectedId(null);
    setLatInput(coord.lat.toFixed(4));
    setLonInput(coord.lon.toFixed(4));
  }, []);

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const lat = Number(latInput);
      const lon = Number(lonInput);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        handlePick({ lat, lon });
      }
    },
    [latInput, lonInput, handlePick]
  );

  return (
    <main className="relative h-screen w-full overflow-hidden bg-void">
      <Globe
        onPick={handlePick}
        picked={picked}
        satelliteBlips={satelliteBlips}
        issPosition={issRaw}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded border border-panel-edge bg-panel/90 px-4 py-3 backdrop-blur-sm">
          <h1 className="font-mono text-sm uppercase tracking-[0.25em] text-ink">
            Project Zenith
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
            The Celestial Eye
          </p>
        </div>

        <form
          onSubmit={handleManualSubmit}
          className="pointer-events-auto flex items-center gap-2 rounded border border-panel-edge bg-panel/90 px-3 py-2 backdrop-blur-sm"
        >
          <input
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            placeholder="lat"
            inputMode="decimal"
            className="tabular w-20 bg-transparent font-mono text-xs text-ink placeholder:text-grey focus:outline-none"
          />
          <span className="text-grey">/</span>
          <input
            value={lonInput}
            onChange={(e) => setLonInput(e.target.value)}
            placeholder="lon"
            inputMode="decimal"
            className="tabular w-20 bg-transparent font-mono text-xs text-ink placeholder:text-grey focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-cyan-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-cyan transition-colors hover:bg-cyan hover:text-void"
          >
            Lock
          </button>
        </form>
      </div>

      {!picked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded border border-panel-edge bg-panel/90 px-5 py-3 font-mono text-xs uppercase tracking-wider text-grey backdrop-blur-sm">
            Click anywhere on the globe to lock a position
          </p>
        </div>
      )}

      {picked && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <div className="pointer-events-auto rounded border border-panel-edge bg-panel/90 p-3 backdrop-blur-sm">
            <RadarSweep blips={radarBlips} size={220} />
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-grey">
              <span className="tabular">
                {picked.lat.toFixed(2)}&deg;, {picked.lon.toFixed(2)}&deg;
              </span>
              <span className="tabular">{now.toUTCString().slice(17, 25)} UTC</span>
            </div>
          </div>
        </div>
      )}

      {picked && (
        <div className="pointer-events-auto absolute inset-y-0 right-0 z-10 w-full max-w-xs border-l border-panel-edge bg-panel/95 backdrop-blur-sm sm:w-80">
          <TrackedList
            objects={trackedObjects}
            loading={loadingCatalog}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      )}
    </main>
  );
}
