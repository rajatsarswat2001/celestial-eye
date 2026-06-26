"use client";

import { useRef, useState } from "react";
import type { SkyObject } from "@/lib/celestial";
import type { SatellitePosition } from "@/lib/satellites";
import SatelliteCard, { prefetchSatInfo } from "./SatelliteCard";

type TrackedObject = SkyObject | SatellitePosition;

interface TrackedListProps {
  objects: TrackedObject[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function kindLabel(kind: TrackedObject["kind"]): string {
  switch (kind) {
    case "sun":      return "STAR";
    case "moon":     return "MOON";
    case "planet":   return "PLANET";
    case "iss":      return "STATION";
    case "satellite": return "SAT";
    default:         return "OBJECT";
  }
}

function kindColor(kind: TrackedObject["kind"]): string {
  switch (kind) {
    case "iss":    return "text-amber bg-amber/8";
    case "sun":    return "text-amber bg-amber/8";
    case "moon":
    case "planet": return "text-ink-dim bg-white/5";
    default:       return "text-cyan bg-cyan/8";
  }
}

function hasNoradId(obj: TrackedObject): obj is SatellitePosition {
  return (obj as SatellitePosition).noradId !== undefined;
}

// Elevation bar: visual fraction of altitude (0–90°)
function ElevBar({ altitudeDeg }: { altitudeDeg: number }) {
  const frac = Math.max(0, Math.min(1, altitudeDeg / 90));
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-cyan/40 transition-all duration-500"
        style={{ width: `${frac * 100}%` }}
      />
    </div>
  );
}

export default function TrackedList({
  objects,
  loading,
  selectedId,
  onSelect,
  onClose,
}: TrackedListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const visible = objects.filter((o) => o.altitudeDeg > -1);

  function handleMouseEnter(obj: TrackedObject) {
    clearTimeout(hoverTimerRef.current);
    setHoveredId(obj.id);
    const sat = hasNoradId(obj) ? obj : null;
    if (sat) prefetchSatInfo(sat.noradId);
  }

  function handleMouseLeave() {
    hoverTimerRef.current = setTimeout(() => setHoveredId(null), 180);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-panel-edge/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-grey">
            Overhead Now
          </h2>
          <span className="tabular rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-ink-dim">
            {visible.length}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-6 w-6 items-center justify-center rounded text-grey transition-colors hover:bg-white/8 hover:text-cyan"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6" fill="none">
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-2 px-4 py-5">
            {[75, 90, 65, 80].map((w, i) => (
              <div key={i} className="skeleton-line h-8 rounded" style={{ width: `${w}%` }} />
            ))}
            <p className="mt-2 font-mono text-[10px] text-grey">Acquiring targets…</p>
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border border-panel-edge flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#4a5a72" strokeWidth="1.3">
                <circle cx="7" cy="7" r="5" />
                <path d="M7 4v3.5l2 2" />
              </svg>
            </div>
            <p className="font-mono text-[10px] text-grey">No objects above horizon.</p>
          </div>
        )}

        <ul>
          {visible.map((obj) => {
            const isSelected = obj.id === selectedId;
            const isHovered = obj.id === hoveredId;
            const isActive = isSelected || isHovered;
            const satellite = hasNoradId(obj) ? obj : null;
            const isSatOrIss = obj.kind === "satellite" || obj.kind === "iss";

            return (
              <li key={obj.id} className="relative">
                <button
                  onClick={() => onSelect(isSelected ? "" : obj.id)}
                  onMouseEnter={() => handleMouseEnter(obj)}
                  onMouseLeave={handleMouseLeave}
                  className={`group flex w-full flex-col gap-0.5 border-b border-panel-edge/40 px-4 py-3 text-left transition-all duration-150 ${
                    isActive
                      ? "bg-white/[0.04]"
                      : "hover:bg-white/[0.025]"
                  }`}
                >
                  {/* Row top: name + badge + elevation */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* Selected indicator */}
                      <div
                        className={`h-1 w-1 shrink-0 rounded-full transition-all ${
                          isSelected ? "bg-cyan" : isHovered ? "bg-cyan/40" : "bg-transparent"
                        }`}
                      />
                      <span className="truncate font-sans text-[12px] font-medium text-ink leading-tight">
                        {obj.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${kindColor(obj.kind)}`}
                      >
                        {kindLabel(obj.kind)}
                      </span>
                      <span className="tabular font-mono text-[12px] text-ink-dim">
                        {obj.altitudeDeg.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Row bottom: elevation bar + azimuth */}
                  <div className="flex items-center gap-2 pl-3">
                    <ElevBar altitudeDeg={obj.altitudeDeg} />
                    <span className="tabular shrink-0 font-mono text-[9px] text-grey">
                      az {obj.azimuthDeg.toFixed(0)}°
                    </span>
                  </div>
                </button>

                {/* Floating detail card — desktop hover/select (pointer devices only).
                    CSS class sat-float-card is display:none by default and
                    display:block only under @media (hover: hover) and (pointer: fine). */}
                {isActive && isSatOrIss && satellite && (
                  <div className="absolute left-full top-0 z-50 ml-2 w-56">
                    <div
                      className="sat-float-card pointer-events-auto"
                      onMouseEnter={() => {
                        clearTimeout(hoverTimerRef.current);
                        setHoveredId(obj.id);
                      }}
                      onMouseLeave={handleMouseLeave}
                    >
                      <SatelliteCard
                        noradId={satellite.noradId}
                        name={obj.name}
                        kind={obj.kind as "iss" | "satellite"}
                        inline={false}
                      />
                    </div>
                  </div>
                )}

                {/* Inline card — mobile tap (or fallback for non-hover devices) */}
                {isSelected && isSatOrIss && satellite && (
                  <div className="sat-inline-card px-4 pb-3 pt-1">
                    <SatelliteCard
                      noradId={satellite.noradId}
                      name={obj.name}
                      kind={obj.kind as "iss" | "satellite"}
                      inline={true}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
