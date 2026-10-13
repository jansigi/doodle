import type { DateAssignment, LineupConfig, Plan, RoleId } from "./types";

// Plan entries as they were stored before the lineup became configurable:
// one fixed field per role.
interface LegacyDateAssignment {
  leader?: string | null;
  vocals?: string[];
  coordinator?: string | null;
  bass?: string | null;
  egit?: string[];
  aguitar?: string | null;
  drums?: string | null;
  keys?: string | null;
  md?: string | null;
}

function cleanNames(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  return [
    ...new Set(
      names.filter(
        (name): name is string => typeof name === "string" && name !== ""
      )
    ),
  ];
}

function single(name: string | null | undefined): string[] {
  return name ? [name] : [];
}

// The legacy fields map onto the ids of the default lineup.
function legacySlots(legacy: LegacyDateAssignment): Record<RoleId, string[]> {
  const vocals = [...(legacy.vocals ?? [])];
  if (legacy.coordinator && !vocals.includes(legacy.coordinator))
    vocals.push(legacy.coordinator);
  return {
    leader: single(legacy.leader),
    vocal: vocals,
    bass: single(legacy.bass),
    egit: legacy.egit ?? [],
    aguitar: single(legacy.aguitar),
    drums: single(legacy.drums),
    keys: single(legacy.keys),
  };
}

export function normalizeRoles(
  roles: string[],
  config: LineupConfig
): RoleId[] {
  const known = new Set(config.roles.map((role) => role.id));
  const normalized: RoleId[] = [];
  for (const role of roles) {
    // The former Vocal Coordinator role was merged into Vocals.
    const mapped = role === "coordinator" ? "vocal" : role;
    if (known.has(mapped) && !normalized.includes(mapped))
      normalized.push(mapped);
  }
  return normalized;
}

// Brings a stored or submitted assignment into the current shape: exactly
// one slot list per configured role, nothing else.
export function normalizeAssignment(
  raw: unknown,
  config: LineupConfig
): DateAssignment {
  const assignment = (raw ?? {}) as {
    slots?: Record<string, unknown>;
  } & LegacyDateAssignment;
  const slots: Record<RoleId, unknown> =
    assignment.slots && typeof assignment.slots === "object"
      ? assignment.slots
      : legacySlots(assignment);
  return {
    slots: Object.fromEntries(
      config.roles.map((role) => [role.id, cleanNames(slots[role.id])])
    ),
    md:
      typeof assignment.md === "string" && assignment.md !== ""
        ? assignment.md
        : null,
  };
}

export function normalizePlan(
  plan: unknown,
  config: LineupConfig
): Plan | null {
  if (!plan || typeof plan !== "object") return null;
  return Object.fromEntries(
    Object.entries(plan as Record<string, unknown>).map(
      ([date, assignment]) => [date, normalizeAssignment(assignment, config)]
    )
  );
}
