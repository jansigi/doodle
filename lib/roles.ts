import type { Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  leader: "Worship Leader",
  coordinator: "Vocal Coordinator",
  vocal: "Vocals",
  bass: "Bass",
  egit: "E-Gitarre",
  aguitar: "A-Gitarre",
  drums: "Drums",
  keys: "Keys",
};

// Only these instrumentalists can take the MD (Musical Director) role
// (A-Guitar does not qualify).
export const INSTRUMENT_ROLES: Role[] = ["bass", "egit", "drums", "keys"];

export const ALL_ROLES: Role[] = [
  "leader",
  "coordinator",
  "vocal",
  "bass",
  "egit",
  "aguitar",
  "drums",
  "keys",
];

// Target lineup per celebration. Leader and coordinator count toward the
// 4-5 vocal total, so 2-3 additional pure vocals are needed.
export const LINEUP_TARGETS: Record<Role, { min: number; max: number }> = {
  leader: { min: 1, max: 1 },
  coordinator: { min: 1, max: 1 },
  vocal: { min: 2, max: 3 },
  bass: { min: 1, max: 1 },
  egit: { min: 1, max: 2 },
  aguitar: { min: 0, max: 1 }, // optional, may double with a singing role
  drums: { min: 1, max: 1 },
  keys: { min: 1, max: 1 },
};

export function formatDateGerman(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
