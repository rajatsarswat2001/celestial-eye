"use client";

// The signature element: a literal rotating radar sweep, the same visual
// grammar as an air-traffic or naval tracking console. It sits as a fixed
// HUD overlay independent of the globe's own camera — this is "what does
// the radar operator see," not a 3D object in the scene. Objects discovered
// near zenith appear as blips around the ring, positioned by azimuth so the
// sweep line visually "catches" them as it rotates past.

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

export default function RadarSweep({ blips, size = 280 }: RadarSweepProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 18;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label="Radar sweep showing tracked objects by azimuth and elevation"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {/* Range rings — horizon, mid-elevation, zenith */}
        {[1, 0.66, 0.33].map((frac) => (
          <circle
            key={frac}
            cx={center}
            cy={center}
            r={maxRadius * frac}
            fill="none"
            stroke="#1b2740"
            strokeWidth={1}
          />
        ))}
        {/* Cardinal crosshair */}
        <line x1={center} y1={center - maxRadius} x2={center} y2={center + maxRadius} stroke="#1b2740" strokeWidth={1} />
        <line x1={center - maxRadius} y1={center} x2={center + maxRadius} y2={center} stroke="#1b2740" strokeWidth={1} />

        {/* Rotating sweep arc */}
        <g style={{ transformOrigin: `${center}px ${center}px` }} className="animate-[radar-spin_6s_linear_infinite]">
          <defs>
            <linearGradient id="sweepFade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#27e1c1" stopOpacity="0" />
              <stop offset="100%" stopColor="#27e1c1" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path
            d={`M ${center} ${center} L ${center} ${center - maxRadius} A ${maxRadius} ${maxRadius} 0 0 1 ${
              center + maxRadius * Math.sin((30 * Math.PI) / 180)
            } ${center - maxRadius * Math.cos((30 * Math.PI) / 180)} Z`}
            fill="url(#sweepFade)"
          />
          <line
            x1={center}
            y1={center}
            x2={center}
            y2={center - maxRadius}
            stroke="#27e1c1"
            strokeWidth={1.5}
          />
        </g>

        {/* Blips: azimuth (0=N, clockwise) maps to angle; elevation maps to radius (zenith = center) */}
        {blips.map((blip) => {
          const angleRad = ((blip.azimuthDeg - 90) * Math.PI) / 180;
          const r = maxRadius * (1 - blip.elevationFrac);
          const x = center + r * Math.cos(angleRad);
          const y = center + r * Math.sin(angleRad);
          return (
            <g key={blip.id}>
              <circle
                cx={x}
                cy={y}
                r={blip.pulse ? 5 : 3.5}
                fill={blip.color}
                className={blip.pulse ? "animate-pulse" : undefined}
              />
            </g>
          );
        })}

        {/* Zenith marker */}
        <circle cx={center} cy={center} r={2.5} fill="#e8ecf1" />
      </svg>

      <span className="absolute left-1/2 top-1.5 -translate-x-1/2 font-mono text-[10px] tracking-widest text-grey">
        N
      </span>
      <span className="absolute left-1/2 bottom-1.5 -translate-x-1/2 font-mono text-[10px] tracking-widest text-grey">
        S
      </span>
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] tracking-widest text-grey">
        W
      </span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] tracking-widest text-grey">
        E
      </span>
    </div>
  );
}
