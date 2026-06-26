"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PickedCoordinate } from "@/components/Globe";
import { computeCelestialBodies, type SkyObject } from "@/lib/celestial";
import {
  findOverheadSatellites,
  type SatellitePosition,
  type TleRecord,
  getSatelliteTrail,
  getSatelliteTelemetry,
} from "@/lib/satellites";
import RadarGlobe, { type RadarSat } from "@/components/RadarGlobe";

// Cesium touches `window` at module load time — SSR must be disabled.
const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

const TICK_MS = 2000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000;
const ISS_REFRESH_MS = 5000;

const CATEGORIES = ["ALL", "STATION", "STARLINK", "WEATHER", "DEBRIS", "ROCKET BODY", "SATELLITE"];

// ─── ORBITAL ROW COMPONENT ───────────────────────────────────────────────────
function OrbRow({ label, val, accent }: { label: string; val: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
      <span style={{ fontSize: "9px", color: "#6B8CAE", letterSpacing: "0.3px" }}>{label}</span>
      <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", fontWeight: "500",
        color: accent === "blue" ? "#60A5FA" : accent === "purple" ? "#A78BFA" : "#94A3B8" }}>
        {val}
      </span>
    </div>
  );
}

// ─── TINY HELPERS ─────────────────────────────────────────────────────────────
function Stat({ dot, label, icon, value, valueStyle }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%",
        background: dot, animation: dot === "#10B981" ? "pulse 2.5s infinite" : "none" }} />}
      {icon}
      {value && <span style={{ ...valueStyle, color: "#E2E8F0" }}>{value}</span>}
      <span style={{ fontSize: "10px", color: "#6B8CAE", fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.5px" }}>{label}</span>
    </div>
  );
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
export default function CelestialEyeDashboard() {
  const [picked, setPicked] = useState<PickedCoordinate | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [satCatalog, setSatCatalog] = useState<TleRecord[]>([]);
  const [issRaw, setIssRaw] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [globeMode, setGlobeMode] = useState("3D GLOBE");
  const [utc, setUtc] = useState("");

  const tickRef = useRef<number | undefined>(undefined);

  // ── Clock tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(tickRef.current);
  }, []);

  // Live UTC clock
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const pad = (x: number) => String(x).padStart(2, "0");
      setUtc(`${pad(n.getUTCHours())}:${pad(n.getUTCMinutes())}:${pad(n.getUTCSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
      } catch {}
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
      } catch {}
    }
    loadIss();
    const interval = window.setInterval(loadIss, ISS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────
  const overheadSatellites: SatellitePosition[] = useMemo(() => {
    if (!picked || satCatalog.length === 0) return [];
    return findOverheadSatellites(satCatalog, picked.lat, picked.lon, now, 0);
  }, [picked, satCatalog, now]);

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

  const satelliteTrails = useMemo(() => {
    const trails: { id: string; points: { lat: number; lon: number }[] }[] = [];
    if (!satCatalog || satCatalog.length === 0) return trails;

    if (selectedId && selectedId.startsWith("sat-")) {
      const noradId = Number(selectedId.replace("sat-", ""));
      const omm = satCatalog.find((c) => Number(c.NORAD_CAT_ID) === noradId);
      if (omm) {
        trails.push({ id: selectedId, points: getSatelliteTrail(omm, now, 45, 45, 2) });
      }
    }

    const issOmm = satCatalog.find((c) => Number(c.NORAD_CAT_ID) === 25544);
    if (issOmm && selectedId !== "sat-25544") {
      trails.push({ id: "iss", points: getSatelliteTrail(issOmm, now, 45, 45, 2) });
    }

    return trails;
  }, [satCatalog, selectedId, now]);

  // Telemetry for the full catalog mapped cleanly for the sidebar
  const sidebarData = useMemo(() => {
    return satCatalog.map(omm => getSatelliteTelemetry(omm, now)).filter(Boolean) as ReturnType<typeof getSatelliteTelemetry>[];
  }, [satCatalog, now]);

  const filtered = useMemo(() => {
    return sidebarData.filter((s) => {
      if (!s) return false;
      const catMatch = category === "ALL" || s.category === category;
      const q = search.toLowerCase();
      const nameMatch = s.name.toLowerCase().includes(q) || s.noradId.toString().includes(q);
      return catMatch && nameMatch;
    }).slice(0, 150); // Limit rendered list to prevent lag
  }, [sidebarData, category, search]);

  const selectedTelemetry = useMemo(() => {
    if (!selectedId) return null;
    const noradId = Number(selectedId.replace("sat-", ""));
    const omm = satCatalog.find(c => Number(c.NORAD_CAT_ID) === noradId);
    if (!omm) return null;
    return getSatelliteTelemetry(omm, now);
  }, [selectedId, satCatalog, now]);

  // Map to RadarGlobe props
  const radarSatellites: RadarSat[] = useMemo(() => {
    return overheadSatellites.map(s => {
      const omm = satCatalog.find(c => `sat-${c.NORAD_CAT_ID}` === s.id);
      return {
        id: s.id,
        name: s.name,
        lat: s.subLat,
        lng: s.subLon,
        inc: omm ? Number(omm.INCLINATION) : 0,
        status: "TRACKING"
      };
    });
  }, [overheadSatellites, satCatalog]);

  const handlePick = useCallback((coord: PickedCoordinate) => {
    setPicked(coord);
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set("lat", coord.lat.toFixed(5));
    url.searchParams.set("lon", coord.lon.toFixed(5));
    window.history.pushState({}, "", url.toString());
  }, []);

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const S = {
    root: { fontFamily: "'Inter', sans-serif", background: "#060C16", color: "#E2E8F0",
      height: "100vh", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
    topBar: { background: "#0B1628", borderBottom: "1px solid #1A2744", padding: "0 18px",
      height: "50px", display: "flex", alignItems: "center", justifyContent: "space-between",
      flexShrink: 0, zIndex: 10 },
    logoText: { fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: "13px",
      letterSpacing: "3.5px", color: "#E2E8F0" },
    main: { flex: 1, display: "flex", overflow: "hidden" },
    sidebar: { width: "230px", background: "#0B1628", borderRight: "1px solid #1A2744",
      display: "flex", flexDirection: "column" as const, flexShrink: 0 },
    sectionLabel: { fontSize: "8px", color: "#6B8CAE", letterSpacing: "2px",
      fontFamily: "'Orbitron', sans-serif" },
    globe: { flex: 1, display: "flex", flexDirection: "column" as const, background: "#060C16",
      position: "relative" as const, overflow: "hidden" },
    rightPanel: { width: "255px", background: "#0B1628", borderLeft: "1px solid #1A2744",
      display: "flex", flexDirection: "column" as const, flexShrink: 0, overflowY: "auto" as const },
    ticker: { height: "26px", background: "#0B1628", borderTop: "1px solid #1A2744",
      overflow: "hidden", display: "flex", alignItems: "center", flexShrink: 0 },
    panel: { padding: "13px", borderBottom: "1px solid #1A2744" },
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:#0D1526}
        ::-webkit-scrollbar-thumb{background:#1A2744;border-radius:2px}
        input::placeholder{color:#4A6080} input:focus{outline:none}
        button{cursor:pointer}
      `}</style>

      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <header style={S.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%",
            border: "2px solid #3B82F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%",
              background: "#3B82F6", animation: "pulse 2.4s ease-in-out infinite" }} />
          </div>
          <span style={S.logoText}>CELESTIAL EYE</span>
          <span style={{ background: "#162340", color: "#60A5FA", fontSize: "9px",
            fontFamily: "'Orbitron', sans-serif", padding: "2px 6px", borderRadius: "3px",
            letterSpacing: "1px", border: "1px solid #1E3A5F" }}>v3.0</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", background: "#0D1526",
          border: "1px solid #1A2744", borderRadius: "6px", padding: "6px 12px",
          gap: "8px", width: "270px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B8CAE" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or NORAD ID…"
            style={{ background: "none", border: "none", color: "#E2E8F0",
              fontSize: "11px", width: "100%", fontFamily: "'Inter', sans-serif" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <Stat dot="#10B981" label="TRACKING" value={overheadSatellites.length} />
          <Stat
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B8CAE" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>}
            value={utc} label="UTC"
            valueStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: "600" }}
          />
          <Stat dot="#3B82F6" label={`${satCatalog.length} OBJECTS`} dotColor="#3B82F6" />
        </div>
      </header>

      {/* ── MAIN ────────────────────────────────────────────────────── */}
      <div style={S.main}>

        {/* ── SIDEBAR ─────────────────────────────────────────────── */}
        <aside style={S.sidebar}>
          <div style={{ padding: "12px", borderBottom: "1px solid #1A2744" }}>
            <div style={{ ...S.sectionLabel, marginBottom: "9px" }}>CATALOG FILTER</div>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              const count = cat === "ALL" ? satCatalog.length : sidebarData.filter(s => s && s.category === cat).length;
              return (
                <button key={cat} onClick={() => setCategory(cat)} style={{
                  width: "100%", background: active ? "rgba(59,130,246,0.1)" : "none",
                  border: "none", borderLeft: `2px solid ${active ? "#3B82F6" : "transparent"}`,
                  color: active ? "#60A5FA" : "#6B8CAE",
                  padding: "5px 8px", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.5px", textAlign: "left", borderRadius: "0 3px 3px 0",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: "2px",
                }}>
                  <span>{cat}</span>
                  <span style={{ fontSize: "9px", color: active ? "#3B82F6" : "#4A6080" }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 12px 5px", ...S.sectionLabel }}>
              OBJECTS ({filtered.length})
            </div>
            {filtered.map((sat) => {
              if (!sat) return null;
              const isActive = selectedId === sat.id;
              const isOverhead = overheadSatellites.some(o => o.id === sat.id);
              const dotColor = isOverhead ? "#10B981" : "#F59E0B";
              return (
                <button key={sat.id} onClick={() => setSelectedId(sat.id)} style={{
                  width: "100%", background: isActive ? "rgba(59,130,246,0.07)" : "none",
                  border: "none", borderLeft: `2px solid ${isActive ? "#3B82F6" : "transparent"}`,
                  padding: "8px 12px", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: "3px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "500",
                      color: isActive ? "#E2E8F0" : "#8BA7C7",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                      {sat.name}
                    </span>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%",
                      background: dotColor, flexShrink: 0,
                      animation: isOverhead ? "pulse 2.5s ease-in-out infinite" : "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span style={{ fontSize: "9px", color: "#4A6080", fontFamily: "'JetBrains Mono', monospace" }}>
                      #{sat.noradId}
                    </span>
                    <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace",
                      color: "#3B82F6" }}>
                      {sat.alt >= 1000 ? `${(sat.alt / 1000).toFixed(1)}Mm` : `${sat.alt.toFixed(0)}km`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── GLOBE AREA ──────────────────────────────────────────── */}
        <main style={S.globe}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 16px", borderBottom: "1px solid #1A2744",
            background: "rgba(11,22,40,0.7)", backdropFilter: "blur(4px)", zIndex: 2 }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <span style={{ ...S.sectionLabel }}>ORBITAL VISUALIZATION</span>
              <span style={{ fontSize: "9px", color: "#3B82F6", fontFamily: "'JetBrains Mono', monospace" }}>
                ECI FRAME · REAL-TIME
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {["2D RADAR", "3D GLOBE"].map((mode) => (
                <button key={mode} onClick={() => setGlobeMode(mode)} style={{
                  background: globeMode === mode ? "#1A3060" : "none",
                  border: `1px solid ${globeMode === mode ? "#3B82F6" : "#1A2744"}`,
                  color: globeMode === mode ? "#60A5FA" : "#6B8CAE",
                  fontSize: "8px", padding: "3px 9px", borderRadius: "3px",
                  fontFamily: "'Orbitron', sans-serif", letterSpacing: "1px",
                }}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: globeMode === "2D RADAR" ? "16px" : "0", position: "relative",
            background: globeMode === "2D RADAR" ? "radial-gradient(ellipse at center, #0D1A30 0%, #060C16 70%)" : "#000" }}>
            
            {globeMode === "2D RADAR" ? (
              <div style={{ position: "relative", width: "min(440px, 90%)", height: "min(440px, 90%)", zIndex: 1 }}>
                <RadarGlobe satellites={radarSatellites} selectedId={selectedId} />
              </div>
            ) : (
              <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
                <Globe
                  onPick={handlePick}
                  picked={picked}
                  satelliteBlips={satelliteBlips}
                  issPosition={issRaw}
                  selectedId={selectedId}
                  satelliteTrails={satelliteTrails}
                />
                
                {/* Instruction overlay for empty state */}
                {!picked && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                    <div className="px-4 py-2 rounded border border-blue-500/30 bg-blue-500/10 backdrop-blur-md">
                      <p className="font-mono text-xs text-blue-400">Click anywhere on the globe to set observer position</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HUD corners */}
            {selectedTelemetry && [
              { pos: { top: "14px", left: "14px" },  label: "ALT", val: `${selectedTelemetry.alt.toFixed(1)} km` },
              { pos: { top: "14px", right: "14px" }, label: "VEL", val: `${selectedTelemetry.vel.toFixed(3)} km/s` },
              { pos: { bottom: "14px", left: "14px" }, label: "LAT", val: `${selectedTelemetry.lat.toFixed(4)}°` },
              { pos: { bottom: "14px", right: "14px" }, label: "LNG", val: `${selectedTelemetry.lng.toFixed(4)}°` },
            ].map((h, i) => (
              <div key={i} style={{ position: "absolute", ...h.pos, background: "rgba(8,16,32,0.85)",
                border: "1px solid #1A2744", borderRadius: "4px", padding: "6px 10px", zIndex: 2 }}>
                <div style={{ fontSize: "7px", color: "#6B8CAE", letterSpacing: "2px",
                  fontFamily: "'Orbitron', sans-serif", marginBottom: "2px" }}>{h.label}</div>
                <div style={{ fontSize: "13px", color: "#60A5FA",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: "500" }}>{h.val}</div>
              </div>
            ))}
          </div>
        </main>

        {/* ── RIGHT TELEMETRY PANEL ────────────────────────────────── */}
        <aside style={S.rightPanel}>
          {selectedTelemetry ? (
            <div style={{ animation: "fadeIn 0.2s ease" }} key={selectedTelemetry.id}>
              <div style={S.panel}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{
                    fontSize: "8px", fontFamily: "'Orbitron', sans-serif", letterSpacing: "1px",
                    color: "#10B981", background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    padding: "2px 7px", borderRadius: "2px",
                  }}>● TRACKING</span>
                  <span style={{ fontSize: "9px", color: "#6B8CAE",
                    fontFamily: "'JetBrains Mono', monospace" }}>#{selectedTelemetry.noradId}</span>
                </div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700,
                  fontSize: "12px", color: "#E2E8F0", letterSpacing: "1px", marginBottom: "6px" }}>
                  {selectedTelemetry.name}
                </div>
                <span style={{ fontSize: "9px", color: "#6B8CAE", background: "#0D1526",
                  padding: "2px 7px", borderRadius: "2px", fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.5px" }}>{selectedTelemetry.category}</span>
              </div>

              <div style={S.panel}>
                <div style={{ ...S.sectionLabel, marginBottom: "10px" }}>ORBITAL ELEMENTS</div>
                <OrbRow label="Altitude" val={`${selectedTelemetry.alt.toFixed(1)} km`} accent="blue" />
                <OrbRow label="Velocity" val={`${selectedTelemetry.vel.toFixed(3)} km/s`} accent="blue" />
                <OrbRow label="Inclination" val={`${selectedTelemetry.inc.toFixed(2)}°`} />
                <OrbRow label="Period" val={`${selectedTelemetry.period.toFixed(2)} min`} />
                <OrbRow label="Eccentricity" val={selectedTelemetry.ecc.toFixed(7)} />
                <OrbRow label="RAAN" val={`${selectedTelemetry.raan.toFixed(1)}°`} />
                <OrbRow label="Arg of Perigee" val={`${selectedTelemetry.aop.toFixed(1)}°`} />
              </div>

              <div style={S.panel}>
                <div style={{ ...S.sectionLabel, marginBottom: "10px" }}>GROUND TRACK</div>
                <OrbRow label="Latitude"
                  val={`${Math.abs(selectedTelemetry.lat).toFixed(4)}° ${selectedTelemetry.lat >= 0 ? "N" : "S"}`}
                  accent="purple" />
                <OrbRow label="Longitude"
                  val={`${Math.abs(selectedTelemetry.lng).toFixed(4)}° ${selectedTelemetry.lng >= 0 ? "E" : "W"}`}
                  accent="purple" />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#4A6080", fontSize: "11px" }}>
              Select a satellite
            </div>
          )}
        </aside>
      </div>

      {/* ── BOTTOM TICKER ───────────────────────────────────────────── */}
      <footer style={S.ticker}>
        <div style={{ background: "#162340", padding: "0 12px", height: "100%",
          display: "flex", alignItems: "center", flexShrink: 0,
          borderRight: "1px solid #1A2744" }}>
          <span style={{ fontSize: "8px", color: "#3B82F6",
            fontFamily: "'Orbitron', sans-serif", letterSpacing: "2px" }}>LIVE</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ animation: "ticker 35s linear infinite",
            display: "flex", gap: "44px", whiteSpace: "nowrap", alignItems: "center", height: "26px" }}>
            {[...overheadSatellites.slice(0, 15), ...overheadSatellites.slice(0, 15)].map((sat, i) => (
              <span key={i} style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
                color: "#6B8CAE", display: "inline-flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#3B82F6" }}>{sat.name}</span>
                <span>ALT <span style={{ color: "#CBD5E1" }}>{sat.altitudeKm.toFixed(0)}km</span></span>
                <span>VEL <span style={{ color: "#CBD5E1" }}>{sat.velocityKmS.toFixed(2)}km/s</span></span>
                <span style={{ color: "#10B981", animation: "pulse 2.5s infinite" }}>●</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
