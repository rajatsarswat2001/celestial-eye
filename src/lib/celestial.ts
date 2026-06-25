// Client-side astronomy calculations for the Sun, Moon, and naked-eye planets.
//
// We deliberately compute these locally with astronomy-engine instead of
// polling NASA Horizons live. Horizons is built for batch/file-based queries,
// has noticeable latency, and rate-limits aggressively — none of which suit a
// live "what's overhead right now" radar that recomputes every few seconds as
// the user drags a picker. astronomy-engine implements the same VSOP/ELP-2000
// class analytic models Horizons itself is checked against, is accurate to
// sub-arcminute for these bodies on human timescales, and runs instantly in
// the browser with zero network dependency or rate limit.

import {
  Body,
  Equator,
  Horizon,
  Observer,
  Illumination,
} from "astronomy-engine";

export type SkyObjectKind = "sun" | "moon" | "planet" | "satellite" | "iss";

export interface SkyObject {
  id: string;
  name: string;
  kind: SkyObjectKind;
  azimuthDeg: number;
  altitudeDeg: number;
  /** Distance from observer, used only for display — not for sky position. */
  rangeKm?: number;
  /** 0..1 illuminated fraction, Moon only. */
  illumination?: number;
  /** How far this object is from dead-overhead. 0 = exact zenith. */
  zenithAngleDeg: number;
}

const PLANET_BODIES: { body: Body; name: string }[] = [
  { body: Body.Mercury, name: "Mercury" },
  { body: Body.Venus, name: "Venus" },
  { body: Body.Mars, name: "Mars" },
  { body: Body.Jupiter, name: "Jupiter" },
  { body: Body.Saturn, name: "Saturn" },
  { body: Body.Uranus, name: "Uranus" },
  { body: Body.Neptune, name: "Neptune" },
];

function toSkyObject(
  id: string,
  name: string,
  kind: SkyObjectKind,
  body: Body,
  date: Date,
  observer: Observer,
  extra?: Partial<SkyObject>
): SkyObject {
  const equ = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, equ.ra, equ.dec, "normal");
  return {
    id,
    name,
    kind,
    azimuthDeg: hor.azimuth,
    altitudeDeg: hor.altitude,
    zenithAngleDeg: 90 - hor.altitude,
    ...extra,
  };
}

/**
 * Computes live horizon-coordinate positions for the Sun, Moon, and the
 * seven naked-eye-relevant planets as seen from the given lat/lon at the
 * given instant.
 */
export function computeCelestialBodies(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): SkyObject[] {
  const observer = new Observer(latitude, longitude, 0);
  const results: SkyObject[] = [];

  results.push(toSkyObject("sun", "Sun", "sun", Body.Sun, date, observer));

  const moonIllum = Illumination(Body.Moon, date);
  results.push(
    toSkyObject("moon", "Moon", "moon", Body.Moon, date, observer, {
      illumination: moonIllum.phase_fraction,
    })
  );

  for (const { body, name } of PLANET_BODIES) {
    results.push(
      toSkyObject(body.toString().toLowerCase(), name, "planet", body, date, observer)
    );
  }

  return results;
}
