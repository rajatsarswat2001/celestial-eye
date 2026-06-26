"use client";

import { useEffect, useState } from "react";

interface TopBarProps {
  onGeolocate: () => void;
  onShare: () => void;
  shareLabel: "copy" | "copied";
}

export default function TopBar({ onGeolocate, onShare, shareLabel }: TopBarProps) {
  const [utc, setUtc] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, "0");
      const m = String(now.getUTCMinutes()).padStart(2, "0");
      const s = String(now.getUTCSeconds()).padStart(2, "0");
      setUtc(`${h}:${m}:${s}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="glass-topbar pointer-events-auto relative z-30 flex h-12 shrink-0 items-center justify-between px-4">
      {/* Logo */}
      <div className="flex items-center gap-3">
        {/* Hexagon icon */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          <polygon
            points="11,1 20.5,6.5 20.5,15.5 11,21 1.5,15.5 1.5,6.5"
            stroke="#27e1c1"
            strokeWidth="1.4"
            fill="rgba(39,225,193,0.07)"
          />
          <polygon
            points="11,5 17,8.5 17,13.5 11,17 5,13.5 5,8.5"
            fill="rgba(39,225,193,0.12)"
          />
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-ink">
            Celestial Eye
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.28em] text-cyan opacity-70">
            Project Zenith
          </span>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* UTC Clock */}
        <div className="mr-3 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-cyan animate-status-pulse" />
          <span className="tabular font-mono text-[11px] text-ink-dim">
            {utc || "--:--:--"}{" "}
            <span className="text-grey text-[9px] uppercase tracking-wider">UTC</span>
          </span>
        </div>

        {/* Geolocate */}
        <button
          onClick={onGeolocate}
          aria-label="Use my location"
          className="flex h-8 w-8 items-center justify-center rounded text-grey transition-colors hover:bg-cyan/8 hover:text-cyan"
          title="Use my location"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
          </svg>
        </button>

        {/* Share / copy link */}
        <button
          onClick={onShare}
          aria-label="Copy shareable link"
          title="Copy link to this view"
          className={`flex h-8 items-center gap-1.5 rounded px-2.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
            shareLabel === "copied"
              ? "bg-cyan/15 text-cyan"
              : "text-grey hover:bg-white/5 hover:text-ink"
          }`}
        >
          {shareLabel === "copied" ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 6l3 3 5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7" />
                <path d="M8 1h3v3M11 1L6 6" />
              </svg>
              Share
            </>
          )}
        </button>
      </div>
    </header>
  );
}
