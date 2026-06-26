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

// Cesium touches `window` at module load time — SSR must be disabled.
const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

const TICK_MS = 2000;
const SATELLITE_REFRESH_MS = 2 * 60 * 60 * 1000;
const ISS_REFRESH_MS = 5000;

const CATEGORIES = ["ALL", "STATION", "STARLINK", "SATELLITE"];

// ─── ORBITAL ROW COMPONENT ───────────────────────────────────────────────────
function OrbRow({ label, val, accent }: { label: string; val: string; accent?: string }) {
  const accentClass = accent === "blue" ? "text-blue-400" : accent === "purple" ? "text-purple-400" : "text-slate-400";
  return (
    <div className="flex justify-between items-center mb-[7px]">
      <span className="text-[9px] text-[#6B8CAE] tracking-[0.3px]">{label}</span>
      <span className={`text-[11px] font-mono font-medium ${accentClass}`}>
        {val}
      </span>
    </div>
  );
}

// ─── TINY HELPERS ─────────────────────────────────────────────────────────────
function Stat({ dot, label, icon, value, valueClass }: any) {
  return (
    <div className="flex items-center gap-[6px] hidden sm:flex">
      {dot && <span className={`w-[6px] h-[6px] rounded-full bg-[${dot}] ${dot === "#10B981" ? "animate-pulse" : ""}`} />}
      {icon}
      {value && <span className={`text-slate-200 ${valueClass || ""}`}>{value}</span>}
      <span className="text-[10px] text-[#6B8CAE] font-mono tracking-[0.5px]">{label}</span>
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
  const [utc, setUtc] = useState("");
  
  // Mobile UI States
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

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
    const list = sidebarData.filter((s) => {
      if (!s) return false;
      const catMatch = category === "ALL" || s.category === category;
      const q = search.toLowerCase();
      const nameMatch = s.name.toLowerCase().includes(q) || s.noradId.toString().includes(q);
      return catMatch && nameMatch;
    });

    if (picked) {
      list.sort((a, b) => {
        if (!a || !b) return 0;
        let dLnga = Math.abs(a.lng - picked.lon);
        if (dLnga > 180) dLnga = 360 - dLnga;
        const da = Math.pow(a.lat - picked.lat, 2) + Math.pow(dLnga, 2);

        let dLngb = Math.abs(b.lng - picked.lon);
        if (dLngb > 180) dLngb = 360 - dLngb;
        const db = Math.pow(b.lat - picked.lat, 2) + Math.pow(dLngb, 2);

        return da - db;
      });
    }

    return list.slice(0, 150); // Limit rendered list to prevent lag
  }, [sidebarData, category, search, picked]);

  const selectedTelemetry = useMemo(() => {
    if (!selectedId) return null;
    const noradId = Number(selectedId.replace("sat-", ""));
    const omm = satCatalog.find(c => Number(c.NORAD_CAT_ID) === noradId);
    if (!omm) return null;
    return getSatelliteTelemetry(omm, now);
  }, [selectedId, satCatalog, now]);

  const handlePick = useCallback((coord: PickedCoordinate) => {
    setPicked(coord);
    setSelectedId(null);
    setIsLeftPanelOpen(false); // Auto close sidebar on mobile when picking
    const url = new URL(window.location.href);
    url.searchParams.set("lat", coord.lat.toFixed(5));
    url.searchParams.set("lon", coord.lon.toFixed(5));
    window.history.pushState({}, "", url.toString());
  }, []);

  return (
    <div className="font-sans bg-[#060C16] text-slate-200 h-screen flex flex-col overflow-hidden">
      <style>{`
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:#0D1526}
        ::-webkit-scrollbar-thumb{background:#1A2744;border-radius:2px}
        input::placeholder{color:#4A6080} input:focus{outline:none}
      `}</style>

      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <header className="bg-[#0B1628] border-b border-[#1A2744] px-3 md:px-5 h-[50px] flex items-center justify-between shrink-0 z-20 relative">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile hamburger to toggle catalog */}
          <button className="md:hidden text-blue-400 p-1" onClick={() => { setIsLeftPanelOpen(!isLeftPanelOpen); setIsRightPanelOpen(false); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          
          <div className="w-[20px] h-[20px] md:w-[26px] md:h-[26px] rounded-full border-2 border-blue-500 flex items-center justify-center hidden sm:flex">
            <div className="w-[5px] h-[5px] md:w-[7px] md:h-[7px] rounded-full bg-blue-500 animate-pulse" />
          </div>
          <span className="font-['Orbitron'] font-bold text-[11px] md:text-[13px] tracking-[2px] md:tracking-[3.5px] text-slate-200">CELESTIAL EYE</span>
          <span className="bg-[#162340] text-blue-400 text-[8px] md:text-[9px] font-['Orbitron'] px-1.5 py-0.5 rounded-[3px] tracking-[1px] border border-[#1E3A5F]">v3.0</span>
        </div>

        <div className="hidden md:flex items-center bg-[#0D1526] border border-[#1A2744] rounded-[6px] px-3 py-1.5 gap-2 w-[270px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B8CAE" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or NORAD ID…"
            className="bg-transparent border-none text-slate-200 text-[11px] w-full font-sans" />
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <Stat dot="#10B981" label="TRACKING" value={overheadSatellites.length} />
          <Stat
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B8CAE" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>}
            value={utc} label="UTC"
            valueClass="font-mono text-[11px] md:text-[12px] font-semibold"
          />
          {/* Mobile telemetry toggle button */}
          {selectedId && (
            <button className="md:hidden text-blue-400 p-1 bg-blue-900/30 rounded" onClick={() => { setIsRightPanelOpen(!isRightPanelOpen); setIsLeftPanelOpen(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── LEFT SIDEBAR (CATALOG) ────────────────────────────────── */}
        <aside className={`
          absolute md:relative z-10 h-full w-[250px] md:w-[230px] bg-[#0B1628] border-r border-[#1A2744]
          flex flex-col shrink-0 transition-transform duration-300 ease-in-out
          ${isLeftPanelOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}>
          <div className="md:hidden p-3 border-b border-[#1A2744]">
            <div className="flex items-center bg-[#0D1526] border border-[#1A2744] rounded-[6px] px-3 py-1.5 gap-2 w-full">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B8CAE" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or NORAD ID…"
                className="bg-transparent border-none text-slate-200 text-[11px] w-full font-sans" />
            </div>
          </div>
          <div className="p-3 border-b border-[#1A2744]">
            <div className="text-[8px] text-[#6B8CAE] tracking-[2px] font-['Orbitron'] mb-[9px]">CATALOG FILTER</div>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              const count = cat === "ALL" ? satCatalog.length : sidebarData.filter(s => s && s.category === cat).length;
              return (
                <button key={cat} onClick={() => setCategory(cat)} className={`
                  w-full px-2 py-1.5 text-[10px] font-mono tracking-[0.5px] text-left rounded-r-[3px]
                  flex justify-between items-center mb-0.5 border-l-2
                  ${active ? "bg-blue-500/10 border-blue-500 text-blue-400" : "bg-transparent border-transparent text-[#6B8CAE]"}
                `}>
                  <span>{cat}</span>
                  <span className={`text-[9px] ${active ? "text-blue-500" : "text-[#4A6080]"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1 text-[8px] text-[#6B8CAE] tracking-[2px] font-['Orbitron']">
              OBJECTS ({filtered.length})
            </div>
            {filtered.map((sat) => {
              if (!sat) return null;
              const isActive = selectedId === sat.id;
              const isOverhead = overheadSatellites.some(o => o.id === sat.id);
              const dotColor = isOverhead ? "bg-emerald-500" : "bg-amber-500";
              return (
                <button key={sat.id} onClick={() => { setSelectedId(sat.id); setIsRightPanelOpen(true); setIsLeftPanelOpen(false); }} className={`
                  w-full px-3 py-2 text-left flex flex-col gap-[3px] border-l-2
                  ${isActive ? "bg-blue-500/10 border-blue-500" : "bg-transparent border-transparent"}
                `}>
                  <div className="flex justify-between items-center w-full">
                    <span className={`text-[11px] font-medium truncate max-w-[150px] md:max-w-[160px] ${isActive ? "text-slate-200" : "text-[#8BA7C7]"}`}>
                      {sat.name}
                    </span>
                    <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${dotColor} ${isOverhead ? "animate-pulse" : ""}`} />
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[9px] text-[#4A6080] font-mono">#{sat.noradId}</span>
                    <span className="text-[9px] font-mono text-blue-500">
                      {sat.alt >= 1000 ? `${(sat.alt / 1000).toFixed(1)}Mm` : `${sat.alt.toFixed(0)}km`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── GLOBE AREA ──────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col bg-[#060C16] relative overflow-hidden w-full">
          {/* Overlay to close sidebar on mobile when tapping globe */}
          {(isLeftPanelOpen || isRightPanelOpen) && (
            <div 
              className="absolute inset-0 bg-[#060C16]/60 backdrop-blur-sm z-0 md:hidden"
              onClick={() => { setIsLeftPanelOpen(false); setIsRightPanelOpen(false); }}
            />
          )}
          
          <div className="flex justify-between items-center px-4 py-[7px] border-b border-[#1A2744] bg-[#0B1628]/70 backdrop-blur-[4px] z-[2]">
            <div className="flex gap-4 items-center">
              <span className="text-[8px] text-[#6B8CAE] tracking-[2px] font-['Orbitron'] hidden sm:inline-block">ORBITAL VISUALIZATION</span>
              <span className="text-[9px] text-blue-500 font-mono">
                ECI FRAME · REAL-TIME
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative p-0 bg-black">
            
            <div className="absolute inset-0 z-[1] touch-none">
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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center px-4 w-full">
                  <div className="inline-block px-4 py-2 rounded border border-blue-500/30 bg-blue-500/10 backdrop-blur-md">
                    <p className="font-mono text-[10px] sm:text-xs text-blue-400">Tap anywhere on the globe to set observer position</p>
                  </div>
                </div>
              )}
            </div>

            {/* HUD corners - hide on mobile when panels are open */}
            <div className={`${isLeftPanelOpen || isRightPanelOpen ? "hidden md:block" : "block"}`}>
              {selectedTelemetry && [
                { pos: "top-3.5 left-3.5",  label: "ALT", val: `${selectedTelemetry.alt.toFixed(1)} km` },
                { pos: "top-3.5 right-3.5", label: "VEL", val: `${selectedTelemetry.vel.toFixed(3)} km/s` },
                { pos: "bottom-3.5 left-3.5", label: "LAT", val: `${selectedTelemetry.lat.toFixed(4)}°` },
                { pos: "bottom-3.5 right-3.5", label: "LNG", val: `${selectedTelemetry.lng.toFixed(4)}°` },
              ].map((h, i) => (
                <div key={i} className={`absolute ${h.pos} bg-[#081020]/85 border border-[#1A2744] rounded px-2.5 py-1.5 z-[2]`}>
                  <div className="text-[7px] text-[#6B8CAE] tracking-[2px] font-['Orbitron'] mb-0.5">{h.label}</div>
                  <div className="text-[11px] sm:text-[13px] text-blue-400 font-mono font-medium">{h.val}</div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── RIGHT TELEMETRY PANEL ────────────────────────────────── */}
        <aside className={`
          absolute right-0 md:relative z-10 h-full w-[260px] md:w-[255px] bg-[#0B1628] border-l border-[#1A2744]
          flex flex-col shrink-0 overflow-y-auto transition-transform duration-300 ease-in-out
          ${isRightPanelOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}>
          <div className="md:hidden flex items-center justify-between p-3 border-b border-[#1A2744]">
            <span className="text-[10px] text-[#6B8CAE] tracking-[2px] font-['Orbitron']">TELEMETRY</span>
            <button className="text-slate-400 p-1" onClick={() => setIsRightPanelOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          
          {selectedTelemetry ? (
            <div className="animate-[fadeIn_0.2s_ease]" key={selectedTelemetry.id}>
              <div className="p-3 border-b border-[#1A2744]">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[8px] font-['Orbitron'] tracking-[1px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-[2px]">
                    ● TRACKING
                  </span>
                  <span className="text-[9px] text-[#6B8CAE] font-mono">#{selectedTelemetry.noradId}</span>
                </div>
                <div className="font-['Orbitron'] font-bold text-[12px] text-slate-200 tracking-[1px] mb-1.5 break-words leading-tight">
                  {selectedTelemetry.name}
                </div>
                <span className="text-[9px] text-[#6B8CAE] bg-[#0D1526] px-1.5 py-0.5 rounded-[2px] font-mono tracking-[0.5px]">
                  {selectedTelemetry.category}
                </span>
              </div>

              <div className="p-3 border-b border-[#1A2744]">
                <div className="text-[8px] text-[#6B8CAE] tracking-[2px] font-['Orbitron'] mb-2.5">ORBITAL ELEMENTS</div>
                <OrbRow label="Altitude" val={`${selectedTelemetry.alt.toFixed(1)} km`} accent="blue" />
                <OrbRow label="Velocity" val={`${selectedTelemetry.vel.toFixed(3)} km/s`} accent="blue" />
                <OrbRow label="Inclination" val={`${selectedTelemetry.inc.toFixed(2)}°`} />
                <OrbRow label="Period" val={`${selectedTelemetry.period.toFixed(2)} min`} />
                <OrbRow label="Eccentricity" val={selectedTelemetry.ecc.toFixed(7)} />
                <OrbRow label="RAAN" val={`${selectedTelemetry.raan.toFixed(1)}°`} />
                <OrbRow label="Arg of Perigee" val={`${selectedTelemetry.aop.toFixed(1)}°`} />
              </div>

              <div className="p-3 border-b border-[#1A2744]">
                <div className="text-[8px] text-[#6B8CAE] tracking-[2px] font-['Orbitron'] mb-2.5">GROUND TRACK</div>
                <OrbRow label="Latitude"
                  val={`${Math.abs(selectedTelemetry.lat).toFixed(4)}° ${selectedTelemetry.lat >= 0 ? "N" : "S"}`}
                  accent="purple" />
                <OrbRow label="Longitude"
                  val={`${Math.abs(selectedTelemetry.lng).toFixed(4)}° ${selectedTelemetry.lng >= 0 ? "E" : "W"}`}
                  accent="purple" />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#4A6080] text-[11px] p-6 text-center">
              Select a satellite from the catalog or globe to view telemetry
            </div>
          )}
        </aside>
      </div>

      {/* ── BOTTOM TICKER ───────────────────────────────────────────── */}
      <footer className="h-[26px] bg-[#0B1628] border-t border-[#1A2744] overflow-hidden flex items-center shrink-0">
        <div className="bg-[#162340] px-2 md:px-3 h-full flex items-center shrink-0 border-r border-[#1A2744] z-10 relative">
          <span className="text-[8px] text-blue-500 font-['Orbitron'] tracking-[2px]">LIVE</span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="flex gap-[44px] whitespace-nowrap items-center h-[26px] animate-[ticker_35s_linear_infinite]">
            {[...overheadSatellites.slice(0, 15), ...overheadSatellites.slice(0, 15)].map((sat, i) => (
              <span key={i} className="text-[10px] font-mono text-[#6B8CAE] inline-flex gap-2 items-center">
                <span className="text-blue-500">{sat.name}</span>
                <span>ALT <span className="text-slate-300">{sat.altitudeKm.toFixed(0)}km</span></span>
                <span>VEL <span className="text-slate-300">{sat.velocityKmS.toFixed(2)}km/s</span></span>
                <span className="text-emerald-500 animate-pulse">●</span>
              </span>
            ))}
            {overheadSatellites.length === 0 && (
              <span className="text-[10px] font-mono text-[#6B8CAE] px-4">Scanning for active objects overhead...</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
