"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RadarSweep, { type RadarBlip } from "@/components/RadarSweep";
import TrackedList from "@/components/TrackedList";
import TopBar from "@/components/TopBar";
import type { PickedCoordinate } from "@/components/Globe";
import { computeCelestialBodies, type SkyObject } from "@/lib/celestial";
import { findOverheadSatellites, type SatellitePosition, type TleRecord } from "@/lib/satellites";

// Cesium touches `window` at module load time — SSR must be disabled.
const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

const TICK_MS = 2000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000;
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState<"copy" | "copied">("copy");
  const [geoError, setGeoError] = useState<string | null>(null);

  const tickRef = useRef<number | undefined>(undefined);

  // ── Clock tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(tickRef.current);
  }, []);

  // ── URL state: read on mount ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (
      Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ) {
      setPicked({ lat, lon });
      setLatInput(lat.toFixed(4));
      setLonInput(lon.toFixed(4));
      setPanelOpen(true);
    }
  }, []);

  // ── Satellite catalog ────────────────────────────────────────────────────
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
        // keep existing catalog on network hiccup
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

  // ── ISS position ─────────────────────────────────────────────────────────
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

  // ── Derived data ─────────────────────────────────────────────────────────
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
          o.kind === "iss"     ? "#ff8a3d"
          : o.kind === "sun"   ? "#ffd76a"
          : o.kind === "moon"  ? "#e8ecf1"
          : o.kind === "planet"? "#27e1c1"
          : "#3d5a7a",
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handlePick = useCallback((coord: PickedCoordinate) => {
    setPicked(coord);
    setSelectedId(null);
    setLatInput(coord.lat.toFixed(4));
    setLonInput(coord.lon.toFixed(4));
    setGeoError(null);
    // Push to URL for shareability
    const url = new URL(window.location.href);
    url.searchParams.set("lat", coord.lat.toFixed(5));
    url.searchParams.set("lon", coord.lon.toFixed(5));
    window.history.replaceState(null, "", url.toString());
    // Open panel on desktop
    if (window.innerWidth >= 640) setPanelOpen(true);
  }, []);

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const lat = Number(latInput);
      const lon = Number(lonInput);
      if (
        Number.isFinite(lat) && Number.isFinite(lon) &&
        Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ) {
        handlePick({ lat, lon });
      }
    },
    [latInput, lonInput, handlePick]
  );

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by this browser.");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePick({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setGeoError("Location access denied. Enter coordinates manually.");
      },
      { timeout: 8000 }
    );
  }, [handlePick]);

  const handleShare = useCallback(() => {
    const url = picked
      ? (() => {
          const u = new URL(window.location.href);
          u.searchParams.set("lat", picked.lat.toFixed(5));
          u.searchParams.set("lon", picked.lon.toFixed(5));
          return u.toString();
        })()
      : window.location.href;

    navigator.clipboard.writeText(url).then(() => {
      setShareLabel("copied");
      setTimeout(() => setShareLabel("copy"), 2000);
    });
  }, [picked]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-void-deep">
      {/* Top bar */}
      <TopBar
        onGeolocate={handleGeolocate}
        onShare={handleShare}
        shareLabel={shareLabel}
      />

      {/* Main content below topbar */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Globe — full bleed behind everything */}
        <Globe
          onPick={handlePick}
          picked={picked}
          satelliteBlips={satelliteBlips}
          issPosition={issRaw}
          selectedId={selectedId}
        />

        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <aside className="glass-sidebar animate-sidebar-in pointer-events-auto relative z-20 hidden w-72 shrink-0 flex-col sm:flex">
          {/* Observer position section */}
          <div className="border-b border-panel-edge/50 px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#27e1c1" strokeWidth="1.4" opacity="0.7">
                <circle cx="6" cy="6" r="2.5" />
                <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" />
              </svg>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-grey">
                Observer Position
              </span>
            </div>

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex flex-1 flex-col gap-0.5">
                  <label className="font-mono text-[8px] uppercase tracking-wider text-grey opacity-60">
                    Latitude
                  </label>
                  <input
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    placeholder="0.0000"
                    inputMode="decimal"
                    className="glass-input tabular w-full rounded-sm px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-grey/40"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <label className="font-mono text-[8px] uppercase tracking-wider text-grey opacity-60">
                    Longitude
                  </label>
                  <input
                    value={lonInput}
                    onChange={(e) => setLonInput(e.target.value)}
                    placeholder="0.0000"
                    inputMode="decimal"
                    className="glass-input tabular w-full rounded-sm px-2 py-1.5 font-mono text-[12px] text-ink placeholder:text-grey/40"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded bg-cyan/10 py-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan transition-colors hover:bg-cyan hover:text-void-deep"
                >
                  Lock Position
                </button>
                <button
                  type="button"
                  onClick={handleGeolocate}
                  className="flex items-center gap-1.5 rounded bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <circle cx="5" cy="5" r="2" />
                    <path d="M5 0v1.5M5 8.5V10M0 5h1.5M8.5 5H10" />
                  </svg>
                  Locate
                </button>
              </div>
            </form>

            {geoError && (
              <p className="mt-2 font-mono text-[9px] text-amber animate-fade-in">{geoError}</p>
            )}

            {picked && (
              <p className="mt-2 font-mono text-[9px] text-grey animate-fade-in">
                <span className="tabular text-ink-dim">{picked.lat.toFixed(4)}°N</span>
                {" / "}
                <span className="tabular text-ink-dim">{picked.lon.toFixed(4)}°E</span>
              </p>
            )}
          </div>

          {/* Overhead list */}
          {picked ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <TrackedList
                objects={trackedObjects}
                loading={loadingCatalog}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onClose={() => {}}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              {/* Animated globe hint */}
              <div className="relative">
                <div className="h-16 w-16 rounded-full border border-cyan/15 flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full border border-cyan/25 animate-[radar-spin_8s_linear_infinite] border-dashed" />
                </div>
                <div className="absolute inset-0 rounded-full" style={{ boxShadow: "0 0 24px rgba(39,225,193,0.08)" }} />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey">
                Click globe to begin
              </p>
              <p className="font-sans text-[11px] text-grey/60 leading-relaxed">
                Select any point on Earth to discover what&apos;s overhead — satellites, the ISS, planets, and more.
              </p>
            </div>
          )}
        </aside>

        {/* Mobile panel toggle — shown only when sidebar is not visible (< sm) */}
        {picked && !panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            aria-label="Show overhead list"
            className="pointer-events-auto absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-l border border-r-0 border-panel-edge/60 bg-panel/90 px-1.5 py-3 font-mono text-[10px] text-grey backdrop-blur-sm hover:text-cyan sm:hidden"
          >
            ‹
          </button>
        )}

        {/* Mobile overlay panel (small screens only) */}
        {panelOpen && (
          <div className="pointer-events-auto absolute inset-y-0 right-0 z-30 w-full max-w-xs sm:hidden">
            <div className="glass-sidebar flex h-full flex-col border-l border-panel-edge/60">
              <div className="flex items-center justify-between border-b border-panel-edge/50 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-grey">Overhead Now</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="flex h-6 w-6 items-center justify-center rounded text-grey hover:text-cyan"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <TrackedList
                  objects={trackedObjects}
                  loading={loadingCatalog}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onClose={() => setPanelOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Radar widget — bottom-right ───────────────────────────────── */}
        {picked && (
          <div className="pointer-events-none absolute bottom-5 right-5 z-10 animate-fade-in">
            <div className="glass-card rounded-lg p-3">
              <RadarSweep blips={radarBlips} size={180} />
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-grey">
                <span className="tabular text-ink-dim">
                  {picked.lat.toFixed(2)}°, {picked.lon.toFixed(2)}°
                </span>
                <span className="tabular">{now.toUTCString().slice(17, 25)} UTC</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
