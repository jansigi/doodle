import type { LineupConfig, Plan, RoleId } from "./types";

export interface PersonPlanStats {
  name: string;
  // Someone who appears in the plan without a participant entry (guest).
  isGuest: boolean;
  roleCounts: Record<RoleId, number>;
  mdCount: number;
  // Celebrations this person is scheduled for. An instrument may double with
  // a singing role, so this can be lower than the sum of all role counts.
  dateCount: number;
}

function emptyRoleCounts(config: LineupConfig): Record<RoleId, number> {
  return Object.fromEntries(config.roles.map((role) => [role.id, 0]));
}

// Counts how often every person plays which instrument across the plan.
// Participants without a single assignment are included with zeros, so the
// table also shows who is currently left out.
export function collectPlanStats(
  plan: Plan,
  dates: string[],
  participantNames: string[],
  config: LineupConfig
): PersonPlanStats[] {
  const knownNames = new Set(participantNames);
  const statsByName = new Map<string, PersonPlanStats>();

  function statsFor(name: string): PersonPlanStats {
    const existing = statsByName.get(name);
    if (existing) return existing;
    const created: PersonPlanStats = {
      name,
      isGuest: !knownNames.has(name),
      roleCounts: emptyRoleCounts(config),
      mdCount: 0,
      dateCount: 0,
    };
    statsByName.set(name, created);
    return created;
  }

  participantNames.forEach(statsFor);

  dates.forEach((date) => {
    const assignment = plan[date];
    if (!assignment) return;
    const namesOnThisDate = new Set<string>();
    config.roles.forEach((role) => {
      (assignment.slots[role.id] ?? []).forEach((name) => {
        statsFor(name).roleCounts[role.id] += 1;
        namesOnThisDate.add(name);
      });
    });
    if (assignment.md) {
      statsFor(assignment.md).mdCount += 1;
      namesOnThisDate.add(assignment.md);
    }
    namesOnThisDate.forEach((name) => {
      statsFor(name).dateCount += 1;
    });
  });

  return [...statsByName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "de-CH")
  );
}

// Median instead of average: a few people with many assignments (or people
// who were never scheduled) would skew the average away from what a typical
// band member actually plays.
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
