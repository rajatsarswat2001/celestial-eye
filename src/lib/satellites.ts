// Satellite position tracking via SGP4 propagation.
//
// TLEs (in CelesTrak's native OMM/JSON form) are fetched server-side — see
// /api/satellites — and cached for ~2 hours, in line with CelesTrak's
// published rate-limit guidance (https://celestrak.org never wants
// per-client polling, and TLEs barely move over a couple of hours anyway).
// The actual propagation to "where is this object right now" happens here,
// client-side, on demand, which is cheap and needs no network call.
//
// satellite.js's json2satrec() is built to accept CelesTrak's OMM JSON
// directly (its own source comments call out CelesTrak's exact field
// quirks), so there's no need to reconstruct legacy fixed-width TLE lines.

import {
  json2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  ecfToLookAngles,
  eciToEcf,
  degreesLat,
  degreesLong,
  type OMMJsonObject,
} from "satellite.js";
import type { SkyObject } from "./celestial";

export type TleRecord = OMMJsonObject;

export interface SatellitePosition extends SkyObject {
  noradId: number;
  subLat: number;
  subLon: number;
  altitudeKm: number;
}

const ISS_NORAD_ID = 25544;

export function propagateSatellite(
  omm: TleRecord,
  observerLat: number,
  observerLon: number,
  date: Date
): SatellitePosition | null {
  let satrec;
  try {
    satrec = json2satrec(omm);
  } catch {
    return null;
  }

  const pv = propagate(satrec, date);
  if (!pv || !pv.position) return null;

  const noradId = Number(omm.NORAD_CAT_ID);
  const gmst = gstime(date);
  const eci = pv.position;
  const geo = eciToGeodetic(eci, gmst);

  const subLat = degreesLat(geo.latitude);
  const subLon = degreesLong(geo.longitude);
  const altitudeKm = geo.height;

  const ecf = eciToEcf(eci, gmst);
  const look = ecfToLookAngles(
    {
      longitude: (observerLon * Math.PI) / 180,
      latitude: (observerLat * Math.PI) / 180,
      height: 0,
    },
    ecf
  );

  const azimuthDeg = (look.azimuth * 180) / Math.PI;
  const elevationDeg = (look.elevation * 180) / Math.PI;

  return {
    id: `sat-${noradId}`,
    noradId,
    name: omm.OBJECT_NAME,
    kind: noradId === ISS_NORAD_ID ? "iss" : "satellite",
    azimuthDeg: (azimuthDeg + 360) % 360,
    altitudeDeg: elevationDeg,
    zenithAngleDeg: 90 - elevationDeg,
    rangeKm: look.rangeSat,
    subLat,
    subLon,
    altitudeKm,
  };
}

export function getSatelliteTrail(
  omm: TleRecord,
  date: Date,
  minutesBefore = 45,
  minutesAfter = 45,
  stepMinutes = 2
): { lat: number; lon: number }[] {
  let satrec;
  try {
    satrec = json2satrec(omm);
  } catch {
    return [];
  }

  const trail: { lat: number; lon: number }[] = [];
  const startMs = date.getTime() - minutesBefore * 60 * 1000;
  const endMs = date.getTime() + minutesAfter * 60 * 1000;
  const stepMs = stepMinutes * 60 * 1000;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const d = new Date(t);
    const pv = propagate(satrec, d);
    if (!pv || !pv.position) continue;
    
    const eci = pv.position;
    const gmst = gstime(d);
    const geo = eciToGeodetic(eci, gmst);
    trail.push({
      lat: degreesLat(geo.latitude),
      lon: degreesLong(geo.longitude),
    });
  }

  return trail;
}

export function findOverheadSatellites(
  catalog: TleRecord[],
  observerLat: number,
  observerLon: number,
  date: Date,
  minElevationDeg = 0
): SatellitePosition[] {
  const results: SatellitePosition[] = [];

  for (const omm of catalog) {
    const pos = propagateSatellite(omm, observerLat, observerLon, date);
    if (pos && pos.altitudeDeg >= minElevationDeg) {
      results.push(pos);
    }
  }

  results.sort((a, b) => a.zenithAngleDeg - b.zenithAngleDeg);
  return results;
}
