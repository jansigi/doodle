import type {
  DateAssignment,
  Participant,
  Plan,
  Role,
} from "./types";
import { emptyDateAssignment } from "./types";
import {
  INSTRUMENT_ROLES,
  LINEUP_TARGETS,
  ROLE_LABELS,
  formatDateGerman,
} from "./roles";

interface PlannerState {
  assignmentCounts: Map<string, number>;
  lastAssignedDateIndex: Map<string, number>;
  mdCounts: Map<string, number>;
  // name -> month ("2026-09") -> assignments in that month
  monthlyAssignmentCounts: Map<string, Map<string, number>>;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function monthlyCount(
  state: PlannerState,
  name: string,
  date: string
): number {
  return state.monthlyAssignmentCounts.get(name)?.get(monthOf(date)) ?? 0;
}

interface PlannerResult {
  plan: Plan;
  warnings: string[];
}

// Roles that hold a single person vs. a list in the DateAssignment.
const SINGLE_ROLES: Role[] = ["leader", "bass", "drums", "keys"];

function assignedNames(assignment: DateAssignment): string[] {
  return [
    assignment.leader,
    assignment.bass,
    assignment.drums,
    assignment.keys,
    ...assignment.vocals,
    ...assignment.egit,
  ].filter((name): name is string => name !== null);
}

function candidateCost(
  participant: Participant,
  date: string,
  dateIndex: number,
  state: PlannerState
): number {
  const availability = participant.availability[date];
  const count = state.assignmentCounts.get(participant.name) ?? 0;
  const lastIndex = state.lastAssignedDateIndex.get(participant.name);
  const maybePenalty = availability === "maybe" ? 4 : 0;
  const consecutivePenalty = lastIndex === dateIndex - 1 ? 3 : 0;
  // Strong (but not absolute) penalty once someone reached their personal
  // per-month wish - they are only picked if nobody else can fill the slot.
  const wishPenalty =
    participant.max_per_month != null &&
    monthlyCount(state, participant.name, date) >= participant.max_per_month
      ? 50
      : 0;
  return count * 10 + maybePenalty + consecutivePenalty + wishPenalty;
}

function pickCandidate(
  participants: Participant[],
  role: Role,
  date: string,
  dateIndex: number,
  alreadyAssigned: Set<string>,
  state: PlannerState,
  options: { yesOnly: boolean }
): Participant | null {
  const candidates = participants
    .filter((participant) => participant.roles.includes(role))
    .filter((participant) => !alreadyAssigned.has(participant.name))
    .filter((participant) => {
      const availability = participant.availability[date];
      return options.yesOnly
        ? availability === "yes"
        : availability === "yes" || availability === "maybe";
    });
  return candidates.reduce<Participant | null>((best, candidate) => {
    if (best === null) return candidate;
    const bestCost = candidateCost(best, date, dateIndex, state);
    const candidateCostValue = candidateCost(candidate, date, dateIndex, state);
    if (candidateCostValue < bestCost) return candidate;
    if (candidateCostValue === bestCost && candidate.name < best.name)
      return candidate;
    return best;
  }, null);
}

function assignToRole(
  assignment: DateAssignment,
  role: Role,
  name: string
): void {
  if (role === "vocal") assignment.vocals.push(name);
  else if (role === "egit") assignment.egit.push(name);
  else assignment[role as "leader" | "bass" | "drums" | "keys"] = name;
}

function recordAssignment(
  participant: Participant,
  date: string,
  dateIndex: number,
  state: PlannerState
): void {
  state.assignmentCounts.set(
    participant.name,
    (state.assignmentCounts.get(participant.name) ?? 0) + 1
  );
  state.lastAssignedDateIndex.set(participant.name, dateIndex);
  const monthCounts =
    state.monthlyAssignmentCounts.get(participant.name) ?? new Map<string, number>();
  monthCounts.set(monthOf(date), (monthCounts.get(monthOf(date)) ?? 0) + 1);
  state.monthlyAssignmentCounts.set(participant.name, monthCounts);
}

// Every slot of a date with the role it stands for. A-Guitar may double with
// a singing role, so a person can show up twice for the same date.
function assignmentSlots(assignment: DateAssignment): Array<[Role, string]> {
  const slots: Array<[Role, string | null]> = [
    ["leader", assignment.leader],
    ["bass", assignment.bass],
    ["drums", assignment.drums],
    ["keys", assignment.keys],
    ["aguitar", assignment.aguitar],
    ...assignment.vocals.map((name): [Role, string] => ["vocal", name]),
    ...assignment.egit.map((name): [Role, string] => ["egit", name]),
  ];
  return slots.filter((slot): slot is [Role, string] => slot[1] !== null);
}

// Derives the hints from a finished plan instead of collecting them while
// assigning, so a manually edited plan produces exactly the same warnings as
// a freshly generated one. Only things that block a celebration are reported:
// a missing instrument, a missing MD and people scheduled more often than
// they wished. Singers and A-Guitar are flexible enough to be left open, and
// «vielleicht» is a normal case rather than a problem.
export function collectPlanWarnings(
  dates: string[],
  participants: Participant[],
  plan: Plan
): string[] {
  const sortedDates = [...dates].sort();
  const participantsByName = new Map(
    participants.map((participant) => [participant.name, participant])
  );
  const warnings: string[] = [];
  // name -> month -> assignments so far, walked in date order.
  const monthlyCounts = new Map<string, Map<string, number>>();

  sortedDates.forEach((date) => {
    const assignment = plan[date];
    if (!assignment) return;
    const namesOnThisDate = new Set<string>();

    assignmentSlots(assignment).forEach(([role, name]) => {
      // Guests are not participants and carry no wishes to check.
      const participant = participantsByName.get(name);
      if (!participant) return;
      // A-Guitar doubling with a singing role stays a single assignment.
      if (namesOnThisDate.has(name)) return;
      namesOnThisDate.add(name);
      const counts = monthlyCounts.get(name) ?? new Map<string, number>();
      const monthCount = (counts.get(monthOf(date)) ?? 0) + 1;
      counts.set(monthOf(date), monthCount);
      monthlyCounts.set(name, counts);
      if (
        participant.max_per_month != null &&
        monthCount > participant.max_per_month
      ) {
        warnings.push(
          `${formatDateGerman(date)}: ${name} (${ROLE_LABELS[role]}) ist öfter eingeteilt als gewünscht (max. ${participant.max_per_month}×/Monat)`
        );
      }
    });

    // Covers both cases: nobody eligible was available and the admin cleared
    // the slot by hand.
    if (assignment.md === null)
      warnings.push(`${formatDateGerman(date)}: MD fehlt`);

    const instrumentCounts: Partial<Record<Role, number>> = {
      bass: assignment.bass ? 1 : 0,
      egit: assignment.egit.length,
      drums: assignment.drums ? 1 : 0,
      keys: assignment.keys ? 1 : 0,
    };
    INSTRUMENT_ROLES.forEach((role) => {
      const count = instrumentCounts[role] ?? 0;
      const target = LINEUP_TARGETS[role];
      if (count >= target.min) return;
      warnings.push(
        target.min === 1
          ? `${formatDateGerman(date)}: ${ROLE_LABELS[role]} fehlt`
          : `${formatDateGerman(date)}: Nur ${count} von ${target.min} ${ROLE_LABELS[role]} gefunden`
      );
    });
  });

  return warnings.sort();
}

export function generatePlan(
  dates: string[],
  participants: Participant[]
): PlannerResult {
  const sortedDates = [...dates].sort();
  const state: PlannerState = {
    assignmentCounts: new Map(),
    lastAssignedDateIndex: new Map(),
    mdCounts: new Map(),
    monthlyAssignmentCounts: new Map(),
  };
  const plan: Plan = Object.fromEntries(
    sortedDates.map((date) => [date, emptyDateAssignment()])
  );

  // Pass 1: fill the required minimum of every role for every date,
  // balancing total load and avoiding back-to-back weeks where possible.
  sortedDates.forEach((date, dateIndex) => {
    const assignment = plan[date];
    const fillOrder: Role[] = [
      "leader",
      "drums",
      "keys",
      "bass",
      "egit",
      "vocal",
    ];
    fillOrder.forEach((role) => {
      const target = LINEUP_TARGETS[role];
      const missing =
        target.min -
        (SINGLE_ROLES.includes(role)
          ? assignment[role as "leader"] !== null
            ? 1
            : 0
          : role === "vocal"
            ? assignment.vocals.length
            : assignment.egit.length);
      Array.from({ length: Math.max(0, missing) }).forEach(() => {
        const currentlyAssigned = new Set(assignedNames(assignment));
        const candidate = pickCandidate(
          participants,
          role,
          date,
          dateIndex,
          currentlyAssigned,
          state,
          { yesOnly: false }
        );
        if (candidate === null) return;
        assignToRole(assignment, role, candidate.name);
        recordAssignment(candidate, date, dateIndex, state);
      });
    });
  });

  // Pass 2: fill optional extra slots (2nd e-guitar) with people
  // who answered "yes", keeping the load balanced.
  sortedDates.forEach((date, dateIndex) => {
    const assignment = plan[date];
    const optionalSlots: Array<{ role: Role; current: number }> = [
      { role: "egit", current: assignment.egit.length },
    ];
    optionalSlots.forEach(({ role, current }) => {
      const target = LINEUP_TARGETS[role];
      Array.from({ length: Math.max(0, target.max - current) }).forEach(() => {
        const currentlyAssigned = new Set(assignedNames(assignment));
        const candidate = pickCandidate(
          participants,
          role,
          date,
          dateIndex,
          currentlyAssigned,
          state,
          { yesOnly: true }
        );
        if (candidate === null) return;
        assignToRole(assignment, role, candidate.name);
        recordAssignment(candidate, date, dateIndex, state);
      });
    });
  });

  // Pass 3: A-Guitar (optional). It is the only instrument that may be
  // combined with a singing role, so prefer a singer of that date who also
  // plays acoustic guitar; otherwise add a free person who answered "yes".
  const participantsByNameForAguitar = new Map(
    participants.map((participant) => [participant.name, participant])
  );
  sortedDates.forEach((date, dateIndex) => {
    const assignment = plan[date];
    const singers = [
      assignment.leader,
      ...assignment.vocals,
    ].filter((name): name is string => name !== null);
    const singingGuitarist = singers
      .map((name) => participantsByNameForAguitar.get(name))
      .filter(
        (participant): participant is Participant =>
          participant !== undefined && participant.roles.includes("aguitar")
      )
      .reduce<Participant | null>((best, candidate) => {
        if (best === null) return candidate;
        const bestCount = state.assignmentCounts.get(best.name) ?? 0;
        const candidateCount =
          state.assignmentCounts.get(candidate.name) ?? 0;
        return candidateCount < bestCount ? candidate : best;
      }, null);
    if (singingGuitarist) {
      // Doubles with their singing slot - no additional load is counted.
      assignment.aguitar = singingGuitarist.name;
      return;
    }
    const standalone = pickCandidate(
      participants,
      "aguitar",
      date,
      dateIndex,
      new Set(assignedNames(assignment)),
      state,
      { yesOnly: true }
    );
    if (standalone) {
      assignment.aguitar = standalone.name;
      recordAssignment(standalone, date, dateIndex, state);
    }
  });

  // Pass 4: pick a musical director per date. Only instrumentalists qualify,
  // so candidates are the people assigned to an instrument slot that date.
  const participantsByName = new Map(
    participants.map((participant) => [participant.name, participant])
  );
  sortedDates.forEach((date) => {
    const assignment = plan[date];
    const mdCandidates = [
      assignment.bass,
      assignment.drums,
      assignment.keys,
      ...assignment.egit,
    ]
      .filter((name): name is string => name !== null)
      .map((name) => participantsByName.get(name))
      .filter(
        (participant): participant is Participant =>
          participant !== undefined && participant.can_md
      );
    const chosen = mdCandidates.reduce<Participant | null>(
      (best, candidate) => {
        if (best === null) return candidate;
        const bestCount = state.mdCounts.get(best.name) ?? 0;
        const candidateCount = state.mdCounts.get(candidate.name) ?? 0;
        return candidateCount < bestCount ? candidate : best;
      },
      null
    );
    if (chosen) {
      assignment.md = chosen.name;
      state.mdCounts.set(chosen.name, (state.mdCounts.get(chosen.name) ?? 0) + 1);
    }
  });

  return {
    plan,
    warnings: collectPlanWarnings(sortedDates, participants, plan),
  };
}
