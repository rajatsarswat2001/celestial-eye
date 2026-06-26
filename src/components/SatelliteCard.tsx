"use client";

import { useEffect, useState } from "react";
import type { SatCatInfo } from "@/lib/satcat";

// ─── Client-side cache (shared across all SatelliteCard instances) ──────────
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

// Exported so TrackedList can warm the cache on hover before click/expand
export function prefetchSatInfo(noradId: number) {
  void fetchSatInfo(noradId);
}

// ─── Status dot ─────────────────────────────────────────────────────────────
function StatusDot({ code }: { code: string | null }) {
  const color =
    code === "+" ? "#22c55e"
    : code === "P" ? "#f59e0b"
    : code === "B" || code === "S" ? "#64748b"
    : code === "-" ? "#ef4444"
    : "#64748b";
  const isOp = code === "+";
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${isOp ? "animate-status-pulse" : ""}`}
      style={{ backgroundColor: color, boxShadow: isOp ? `0 0 5px ${color}` : "none" }}
    />
  );
}

// ─── Data row ────────────────────────────────────────────────────────────────
function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-grey shrink-0">{label}</span>
      <span className={`tabular truncate text-right font-mono text-[11px] ${accent ? "text-cyan" : "text-ink-dim"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-2 py-2">
      {[60, 80, 70, 85, 65].map((w, i) => (
        <div
          key={i}
          className="skeleton-line h-2.5"
          style={{ width: `${w}%`, marginLeft: i % 2 === 0 ? "auto" : 0 }}
        />
      ))}
    </div>
  );
}

// ─── Main card ───────────────────────────────────────────────────────────────
interface SatelliteCardProps {
  noradId: number;
  name: string;
  kind: "iss" | "satellite";
  /** When true renders inline (mobile); when false renders as floating card */
  inline?: boolean;
}

export default function SatelliteCard({ noradId, name, kind, inline = false }: SatelliteCardProps) {
  const [info, setInfo] = useState<SatCatInfo | null>(clientCache.get(noradId) ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    clientCache.has(noradId) ? "ready" : "loading"
  );

  useEffect(() => {
    if (clientCache.has(noradId)) return;
    let cancelled = false;

    fetchSatInfo(noradId).then((result) => {
      if (cancelled) return;
      if (result) { setInfo(result); setStatus("ready"); }
      else setStatus("error");
    });
    return () => { cancelled = true; };
  }, [noradId]);

  const isAmber = kind === "iss";
  const accentColor = isAmber ? "border-l-amber" : "border-l-cyan";
  const cardClass = isAmber ? "glass-card-amber" : "glass-card";
  const animClass = inline ? "animate-card-in" : "animate-card-in-right";

  return (
    <div
      className={`${cardClass} ${animClass} border-l-2 ${accentColor} rounded-r overflow-hidden`}
      style={{ minWidth: inline ? undefined : 220 }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${isAmber ? "border-b border-amber/10" : "border-b border-cyan/8"}`}>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[11px] font-medium text-ink leading-tight">{name}</span>
          <span className={`font-mono text-[8px] uppercase tracking-[0.2em] ${isAmber ? "text-amber" : "text-cyan"} opacity-80`}>
            NORAD {noradId}
          </span>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
          isAmber ? "bg-amber/10 text-amber" : "bg-cyan/8 text-cyan"
        }`}>
          {kind === "iss" ? "STATION" : "SAT"}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {status === "loading" && <Skeleton />}
        {status === "error" && (
          <p className="py-2 font-mono text-[10px] text-grey">No catalog record available.</p>
        )}
        {status === "ready" && info && (
          <div className="space-y-0">
            {/* Status with dot */}
            <div className="flex items-baseline justify-between gap-3 py-[3px]">
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-grey shrink-0">Status</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-dim">
                <StatusDot code={info.opsStatus} />
                {info.opsStatusDisplay}
              </span>
            </div>

            <Row label="Country / Op" value={info.ownerLabel} />
            <Row label="Launched" value={info.launchDateDisplay} />
            {info.launchSite && <Row label="Launch site" value={info.launchSite} />}
            {info.periodMin !== null && (
              <Row label="Period" value={`${info.periodMin.toFixed(1)} min`} accent />
            )}
            {info.apogeeKm !== null && info.perigeeKm !== null && (
              <Row
                label="Apo / Peri"
                value={`${info.apogeeKm.toFixed(0)} / ${info.perigeeKm.toFixed(0)} km`}
                accent
              />
            )}
            {info.inclinationDeg !== null && (
              <Row label="Inclination" value={`${info.inclinationDeg.toFixed(1)}°`} />
            )}
            {info.rcsSize && <Row label="Size class" value={info.rcsSize} />}
            {info.intlDesignator && (
              <Row label="Intl. desig." value={info.intlDesignator} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
