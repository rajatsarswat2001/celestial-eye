// CelesTrak's SATCAT (Satellite Catalog) gives us the "who/what/when" facts
// that orbital elements alone don't carry: owning country/agency, launch
// date, launch site, object type, and current operational status.
// Reference: https://celestrak.org/satcat/satcat-format.php
//
// The catalog reports ownership as a short source code (e.g. "US", "PRC",
// "CIS") rather than a display name, so we keep a lookup table for the
// codes that actually show up in the "active" group we track. Unmapped
// codes still display gracefully — we just show the raw code.
const OWNER_NAMES: Record<string, string> = {
  ISS: "International Space Station (multinational)",
  US: "United States",
  CIS: "Russia / former USSR",
  PRC: "China",
  IND: "India",
  JPN: "Japan",
  ESA: "European Space Agency",
  FR: "France",
  UK: "United Kingdom",
  GER: "Germany",
  CA: "Canada",
  AUS: "Australia",
  ISRA: "Israel",
  BRAZ: "Brazil",
  ITSO: "Intelsat",
  ITAL: "Italy",
  SPN: "Spain",
  NETH: "Netherlands",
  SWED: "Sweden",
  NOR: "Norway",
  SKOR: "South Korea",
  ROK: "South Korea",
  TURK: "Turkey",
  UAE: "United Arab Emirates",
  SAUD: "Saudi Arabia",
  ARGN: "Argentina",
  MEX: "Mexico",
  IRAN: "Iran",
  PAK: "Pakistan",
  EUTE: "Eutelsat",
  SES: "SES S.A.",
  O3B: "O3b Networks",
  GLOB: "Globalstar",
  ORBC: "Orbcomm",
  SAFR: "South Africa",
  INDO: "Indonesia",
  THAI: "Thailand",
  VTNM: "Vietnam",
  SING: "Singapore",
  MYS: "Malaysia",
  PHL: "Philippines",
  EGYP: "Egypt",
  NIGR: "Nigeria",
  KEN: "Kenya",
  NZ: "New Zealand",
  LUXE: "Luxembourg",
  CZCH: "Czech Republic",
  POL: "Poland",
  FIN: "Finland",
  DEN: "Denmark",
  SWTZ: "Switzerland",
  AB: "Astrobotic / commercial",
  STCT: "SpaceX (Starlink)",
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  PAYLOAD: "Payload (active spacecraft)",
  "ROCKET BODY": "Rocket body (spent stage)",
  DEBRIS: "Debris fragment",
  "TBA": "Unidentified / to be assigned",
  UNKNOWN: "Unknown object type",
};

const OPS_STATUS_LABELS: Record<string, string> = {
  "+": "Operational",
  "-": "Nonoperational",
  P: "Partially operational",
  B: "Backup / standby",
  S: "Spare",
  X: "Extended mission",
  D: "Decayed",
  "?": "Status unknown",
};

export function ownerName(code?: string | null): string {
  if (!code) return "Unknown";
  return OWNER_NAMES[code] ?? code;
}

export function objectTypeLabel(code?: string | null): string {
  if (!code) return "Unknown";
  return OBJECT_TYPE_LABELS[code] ?? code;
}

export function opsStatusLabel(code?: string | null): string {
  if (!code) return "Unknown";
  return OPS_STATUS_LABELS[code] ?? code;
}

export function formatLaunchDate(date?: string | null): string {
  if (!date) return "Unknown";
  // CelesTrak gives YYYY-MM-DD; render it a little more readably.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface SatCatInfo {
  noradId: number;
  name: string;
  intlDesignator: string | null;
  owner: string | null;
  ownerLabel: string;
  objectType: string | null;
  objectTypeDisplay: string;
  launchDate: string | null;
  launchDateDisplay: string;
  launchSite: string | null;
  decayDate: string | null;
  periodMin: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  inclinationDeg: number | null;
  rcsSize: string | null;
  opsStatus: string | null;
  opsStatusDisplay: string;
}
