import type { DateAssignment, Plan, Role } from "./types";
import { ALL_ROLES } from "./roles";

type LegacyDateAssignment = DateAssignment & { coordinator?: string | null };

export function normalizeRoles(roles: string[]): Role[] {
  const normalized: Role[] = [];
  for (const role of roles) {
    if (role === "coordinator") {
      if (!normalized.includes("vocal")) normalized.push("vocal");
    } else if (ALL_ROLES.includes(role as Role)) {
      if (!normalized.includes(role as Role)) normalized.push(role as Role);
    }
  }
  return normalized;
}

export function normalizeAssignment(
  assignment: LegacyDateAssignment
): DateAssignment {
  const vocals = [...assignment.vocals];
  if (assignment.coordinator && !vocals.includes(assignment.coordinator)) {
    vocals.push(assignment.coordinator);
  }
  return {
    leader: assignment.leader,
    vocals,
    bass: assignment.bass,
    egit: assignment.egit,
    aguitar: assignment.aguitar,
    drums: assignment.drums,
    keys: assignment.keys,
    md: assignment.md,
  };
}

export function normalizePlan(plan: Plan | null): Plan | null {
  if (!plan) return null;
  return Object.fromEntries(
    Object.entries(plan).map(([date, assignment]) => [
      date,
      normalizeAssignment(assignment as LegacyDateAssignment),
    ])
  );
}
