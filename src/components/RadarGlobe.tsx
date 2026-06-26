"use client";

import { useState, useEffect, useRef } from "react";

export interface RadarSat {
  id: string;
  name: string;
  lat: number;
  lng: number;
  inc: number;
  status: "TRACKING" | "LOST" | "ACQUIRING";
}

interface RadarGlobeProps {
  satellites: RadarSat[];
  selectedId?: string | null;
}

export default function RadarGlobe({ satellites, selectedId }: RadarGlobeProps) {
  const [sweep, setSweep] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (lastRef.current !== null) {
        const dt = ts - lastRef.current;
        setSweep((a) => (a + dt * 0.06) % 360);
      }
      lastRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const CX = 200, CY = 200, R = 172;
  const toXY = (lat: number, lng: number) => ({
    x: CX + (lng / 180) * R,
    y: CY - (lat / 90) * (R * 0.97),
  });

  const sweepRad = (sweep * Math.PI) / 180;
  const sx = CX + R * Math.cos(sweepRad);
  const sy = CY + R * Math.sin(sweepRad);

  const selectedSat = satellites.find((s) => s.id === selectedId);

  return (
    <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0E1E38" />
          <stop offset="65%" stopColor="#071020" />
          <stop offset="100%" stopColor="#030810" />
        </radialGradient>
        <radialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#3B82F6" stopOpacity="0" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.18" />
        </radialGradient>
        <radialGradient id="sweepFan" cx={`${(CX / 400) * 100}%`} cy={`${(CY / 400) * 100}%`} r="50%" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
        <clipPath id="globeClip">
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>
        <filter id="satGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="faintGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer dashed rings */}
      <circle cx={CX} cy={CY} r={R + 12} fill="none" stroke="#1A3060" strokeWidth="1" strokeDasharray="3 5" />
      <circle cx={CX} cy={CY} r={R + 24} fill="none" stroke="#1A3060" strokeWidth="0.5" strokeDasharray="1 8" opacity="0.5" />

      {/* Globe base */}
      <circle cx={CX} cy={CY} r={R} fill="url(#bgGrad)" />
      <circle cx={CX} cy={CY} r={R} fill="url(#rimGlow)" />

      <g clipPath="url(#globeClip)">
        {/* Latitude lines */}
        {[-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75].map((lat) => {
          const yy = CY - (lat / 90) * (R * 0.97);
          const hw = Math.sqrt(Math.max(0, R * R - ((lat / 90) * R * 0.97) ** 2));
          const isEq = lat === 0;
          return (
            <line key={lat} x1={CX - hw} y1={yy} x2={CX + hw} y2={yy}
              stroke={isEq ? "#2563EB" : "#172B4D"}
              strokeWidth={isEq ? 0.8 : 0.4} opacity={isEq ? 0.7 : 0.5} />
          );
        })}

        {/* Longitude lines */}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => {
          const xx = CX + (lng / 180) * R;
          const isPM = lng === 0;
          return (
            <line key={lng} x1={xx} y1={CY - R} x2={xx} y2={CY + R}
              stroke={isPM ? "#2563EB" : "#172B4D"}
              strokeWidth={isPM ? 0.8 : 0.4} opacity={isPM ? 0.7 : 0.5} />
          );
        })}

        {/* Orbit arc for selected satellite */}
        {selectedSat && (
          <ellipse
            cx={CX} cy={CY}
            rx={R * 0.82} ry={R * 0.28}
            fill="none" stroke="#3B82F6"
            strokeWidth="1" strokeDasharray="4 3" opacity="0.45"
            transform={`rotate(${selectedSat.inc * 0.6 - 30}, ${CX}, ${CY})`}
          />
        )}

        {/* Sweep fan */}
        <path
          d={`M ${CX} ${CY} L ${sx} ${sy}`}
          stroke="#3B82F6" strokeWidth="1.5" opacity="0.9"
        />
        {/* Fan gradient sector — approximate with a wide stroke */}
        <path
          d={`M ${CX} ${CY} L ${CX + R * Math.cos(sweepRad - 0.45)} ${CY + R * Math.sin(sweepRad - 0.45)}`}
          stroke="#3B82F6" strokeWidth="90" opacity="0.04" strokeLinecap="butt"
        />

        {/* Satellite dots */}
        {satellites.map((sat) => {
          const { x, y } = toXY(sat.lat, sat.lng);
          const isSelected = sat.id === selectedId;
          const isLost = sat.status === "LOST";
          const dotColor = isLost ? "#EF4444" : isSelected ? "#F59E0B" : "#3B82F6";
          return (
            <g key={sat.id} filter={isSelected ? "url(#satGlow)" : "url(#faintGlow)"}>
              {isSelected && <circle cx={x} cy={y} r={10} fill={dotColor} opacity="0.15" />}
              {isSelected && <circle cx={x} cy={y} r={7} fill="none" stroke={dotColor} strokeWidth="1" opacity="0.4" />}
              <circle cx={x} cy={y} r={isSelected ? 4.5 : 2.8} fill={dotColor} opacity={isLost ? 0.55 : 1} />
              {isSelected && (
                <text x={x + 9} y={y - 5} fill="#F59E0B" fontSize="8"
                  fontFamily="'JetBrains Mono', monospace" fontWeight="600">
                  {sat.name.split(" ")[0]}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Globe border */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#3B82F6" strokeWidth="1.2" opacity="0.25" />

      {/* Corner crosshairs */}
      {[
        [CX - R * 0.68, CY - R * 0.68],
        [CX + R * 0.68, CY - R * 0.68],
        [CX - R * 0.68, CY + R * 0.68],
        [CX + R * 0.68, CY + R * 0.68],
      ].map(([px, py], i) => (
        <g key={i} opacity="0.3">
          <line x1={px - 7} y1={py} x2={px + 7} y2={py} stroke="#3B82F6" strokeWidth="1" />
          <line x1={px} y1={py - 7} x2={px} y2={py + 7} stroke="#3B82F6" strokeWidth="1" />
        </g>
      ))}

      {/* Range rings label */}
      <text x={CX + R * 0.02} y={CY - R * 0.97 + 10} fill="#2563EB" fontSize="7"
        fontFamily="'JetBrains Mono', monospace" opacity="0.6">90°N</text>
      <text x={CX + R * 0.02} y={CY + R * 0.97 - 3} fill="#2563EB" fontSize="7"
        fontFamily="'JetBrains Mono', monospace" opacity="0.6">90°S</text>
    </svg>
  );
}
