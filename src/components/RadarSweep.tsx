"use client";

// The signature element: a literal rotating radar sweep, the same visual
// grammar as an air-traffic or naval tracking console. Objects discovered
// near zenith appear as blips around the ring, positioned by azimuth so
// the sweep line visually "catches" them as it rotates past.

export interface RadarBlip {
  id: string;
  azimuthDeg: number;
  /** 0 = horizon, 1 = zenith. Determines radial distance from center. */
  elevationFrac: number;
  color: string;
  label?: string;
  pulse?: boolean;
}

interface RadarSweepProps {
  blips: RadarBlip[];
  size?: number;
}

export default function RadarSweep({ blips, size = 200 }: RadarSweepProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 14;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label="Radar sweep showing tracked objects by azimuth and elevation"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#27e1c1" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#27e1c1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweepFade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#27e1c1" stopOpacity="0" />
            <stop offset="100%" stopColor="#27e1c1" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Subtle radial background glow */}
        <circle cx={center} cy={center} r={maxRadius} fill="url(#radarBg)" />

        {/* Range rings — horizon, mid-elevation, zenith */}
        {[1, 0.66, 0.33].map((frac) => (
          <circle
            key={frac}
            cx={center}
            cy={center}
            r={maxRadius * frac}
            fill="none"
            stroke="rgba(39,225,193,0.12)"
            strokeWidth={frac === 1 ? 1.2 : 0.8}
          />
        ))}

        {/* Cardinal crosshair */}
        <line
          x1={center} y1={center - maxRadius}
          x2={center} y2={center + maxRadius}
          stroke="rgba(39,225,193,0.08)" strokeWidth={0.8}
        />
        <line
          x1={center - maxRadius} y1={center}
          x2={center + maxRadius} y2={center}
          stroke="rgba(39,225,193,0.08)" strokeWidth={0.8}
        />

        {/* Rotating sweep arc */}
        <g
          style={{ transformOrigin: `${center}px ${center}px` }}
          className="animate-[radar-spin_7s_linear_infinite]"
        >
          <path
            d={`M ${center} ${center} L ${center} ${center - maxRadius} A ${maxRadius} ${maxRadius} 0 0 1 ${
              center + maxRadius * Math.sin((28 * Math.PI) / 180)
            } ${center - maxRadius * Math.cos((28 * Math.PI) / 180)} Z`}
            fill="url(#sweepFade)"
            opacity="0.9"
          />
          <line
            x1={center} y1={center}
            x2={center} y2={center - maxRadius}
            stroke="#27e1c1" strokeWidth={1.2}
            strokeLinecap="round"
          />
        </g>

        {/* Blips: azimuth (0=N, clockwise) → angle; elevation → radius (zenith = center) */}
        {blips.map((blip) => {
          const angleRad = ((blip.azimuthDeg - 90) * Math.PI) / 180;
          const r = maxRadius * (1 - blip.elevationFrac);
          const x = center + r * Math.cos(angleRad);
          const y = center + r * Math.sin(angleRad);
          const radius = blip.pulse ? 5.5 : 3;

          return (
            <g key={blip.id}>
              {/* Glow ring behind blip */}
              {blip.pulse && (
                <circle
                  cx={x}
                  cy={y}
                  r={radius + 4}
                  fill="none"
                  stroke={blip.color}
                  strokeWidth={1}
                  opacity={0.35}
                  className="animate-blip-pulse"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill={blip.color}
                style={{
                  filter: `drop-shadow(0 0 ${blip.pulse ? 5 : 3}px ${blip.color})`,
                }}
              />
            </g>
          );
        })}

        {/* Zenith marker */}
        <circle cx={center} cy={center} r={2} fill="rgba(232,236,241,0.6)" />
      </svg>

      {/* Cardinal labels */}
      <span className="absolute left-1/2 top-0.5 -translate-x-1/2 font-mono text-[8px] tracking-widest text-grey opacity-60">N</span>
      <span className="absolute left-1/2 bottom-0.5 -translate-x-1/2 font-mono text-[8px] tracking-widest text-grey opacity-60">S</span>
      <span className="absolute left-0.5 top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-widest text-grey opacity-60">W</span>
      <span className="absolute right-0.5 top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-widest text-grey opacity-60">E</span>
    </div>
  );
}
