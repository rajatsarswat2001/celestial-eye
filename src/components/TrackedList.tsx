"use client";

import type { SkyObject } from "@/lib/celestial";
import type { SatellitePosition } from "@/lib/satellites";

type TrackedObject = SkyObject | SatellitePosition;

interface TrackedListProps {
  objects: TrackedObject[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function kindLabel(kind: TrackedObject["kind"]): string {
  switch (kind) {
    case "sun":
      return "STAR";
    case "moon":
      return "MOON";
    case "planet":
      return "PLANET";
    case "iss":
      return "STATION";
    case "satellite":
      return "SATELLITE";
    default:
      return "OBJECT";
  }
}

function kindColor(kind: TrackedObject["kind"]): string {
  switch (kind) {
    case "iss":
      return "text-amber";
    case "sun":
      return "text-amber";
    case "moon":
    case "planet":
      return "text-ink";
    default:
      return "text-cyan";
  }
}

export default function TrackedList({ objects, loading, selectedId, onSelect }: TrackedListProps) {
  const visible = objects.filter((o) => o.altitudeDeg > -1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between border-b border-panel-edge px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-grey">
          Overhead Now
        </h2>
        <span className="tabular font-mono text-xs text-grey">{visible.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-6 font-mono text-xs text-grey">
            Acquiring targets&hellip;
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="px-4 py-6 font-mono text-xs text-grey">
            No tracked bodies above the horizon at this point.
          </div>
        )}

        <ul>
          {visible.map((obj) => {
            const isSelected = obj.id === selectedId;
            return (
              <li key={obj.id}>
                <button
                  onClick={() => onSelect(obj.id)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-panel-edge/60 px-4 py-2.5 text-left transition-colors hover:bg-panel ${
                    isSelected ? "bg-panel" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-ink">{obj.name}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-wider ${kindColor(obj.kind)}`}>
                      {kindLabel(obj.kind)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="tabular font-mono text-sm text-ink">
                      {obj.altitudeDeg.toFixed(1)}&deg;
                    </span>
                    <span className="tabular font-mono text-[10px] text-grey">
                      az {obj.azimuthDeg.toFixed(0)}&deg;
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
