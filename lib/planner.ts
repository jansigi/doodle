import type {
  DateAssignment,
  LineupConfig,
  Participant,
  Plan,
  RoleConfig,
} from "./types";
import { emptyDateAssignment } from "./types";
import { formatDateGerman, mdEnabled, rolesCombinable } from "./roles";

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

// Every slot of a date with the role it stands for, in column order. Someone
// combining an instrument with a singing role shows up twice.
function assignmentSlots(
  config: LineupConfig,
  assignment: DateAssignment
): Array<[RoleConfig, string]> {
  return config.roles.flatMap((role) =>
    (assignment.slots[role.id] ?? []).map(
      (name): [RoleConfig, string] => [role, name]
    )
  );
}

function scheduledNames(
  config: LineupConfig,
  assignment: DateAssignment
): string[] {
  return [
    ...new Set(assignmentSlots(config, assignment).map(([, name]) => name)),
  ];
}

// Whether `name` may take `role` on top of the slots they already hold on
// this date. Also false for a second slot of the same role.
function canAlsoTake(
  config: LineupConfig,
  assignment: DateAssignment,
  name: string,
  role: RoleConfig
): boolean {
  return assignmentSlots(config, assignment)
    .filter(([, slotName]) => slotName === name)
    .every(([heldRole]) => rolesCombinable(heldRole, role));
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

interface SlotCandidates {
  // Not scheduled on this date yet.
  free: Participant[];
  // Already scheduled on this date in a slot this role combines with, in
  // slot order.
  doublers: Participant[];
}

function slotCandidates(
  participants: Participant[],
  config: LineupConfig,
  assignment: DateAssignment,
  role: RoleConfig,
  date: string,
  options: { yesOnly: boolean }
): SlotCandidates {
  const participantsByName = new Map(
    participants.map((participant) => [participant.name, participant])
  );
  const scheduled = scheduledNames(config, assignment);
  const free = participants
    .filter((participant) => participant.roles.includes(role.id))
    .filter((participant) => !scheduled.includes(participant.name))
    .filter((participant) => {
      const availability = participant.availability[date];
      return options.yesOnly
        ? availability === "yes"
        : availability === "yes" || availability === "maybe";
    });
  // Already coming that date, so their availability needs no second check.
  const doublers = scheduled
    .map((name) => participantsByName.get(name))
    .filter(
      (participant): participant is Participant =>
        participant !== undefined &&
        participant.roles.includes(role.id) &&
        canAlsoTake(config, assignment, participant.name, role)
    );
  return { free, doublers };
}

function cheapestCandidate(
  candidates: Participant[],
  date: string,
  dateIndex: number,
  state: PlannerState
): Participant | null {
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

// Doubling adds no celebration for that person, so the one with the fewest
// assignments so far gets it.
function leastBusy(
  candidates: Participant[],
  counts: Map<string, number>
): Participant | null {
  return candidates.reduce<Participant | null>((best, candidate) => {
    if (best === null) return candidate;
    const bestCount = counts.get(best.name) ?? 0;
    const candidateCount = counts.get(candidate.name) ?? 0;
    return candidateCount < bestCount ? candidate : best;
  }, null);
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

// Fills one slot of `role`. Required slots (up to the minimum) are shared
// fairly among people who are not scheduled that date yet - doubling up is
// only the fallback when nobody else is available. Optional slots prefer
// someone who is there anyway (e.g. the worship leader brings the acoustic
// guitar), so the extra needs no additional person.
function fillSlot(
  assignment: DateAssignment,
  role: RoleConfig,
  candidates: SlotCandidates,
  required: boolean,
  date: string,
  dateIndex: number,
  state: PlannerState
): boolean {
  const freePick = cheapestCandidate(candidates.free, date, dateIndex, state);
  const doublerPick = leastBusy(candidates.doublers, state.assignmentCounts);
  const doubling = required
    ? freePick === null && doublerPick !== null
    : doublerPick !== null;
  const chosen = doubling ? doublerPick : freePick;
  if (chosen === null) return false;
  assignment.slots[role.id].push(chosen.name);
  // A second slot on the same date is no additional assignment.
  if (!doubling) recordAssignment(chosen, date, dateIndex, state);
  return true;
}

// Order in which required slots are filled: a singing role with a single
// slot (the lead, e.g. the worship leader) first, then the instruments, then
// the remaining vocals. Singers are the most flexible to leave open, while a
// missing instrument blocks the celebration.
function fillGroup(role: RoleConfig): number {
  if (!role.singing) return 1;
  return role.max === 1 ? 0 : 2;
}

// Derives the hints from a finished plan instead of collecting them while
// assigning, so a manually edited plan produces exactly the same warnings as
// a freshly generated one. Only things that block a celebration are reported:
// a missing instrument, a missing MD and people scheduled more often than
// they wished. Singers are flexible enough to be left open, and
// «vielleicht» is a normal case rather than a problem.
export function collectPlanWarnings(
  dates: string[],
  participants: Participant[],
  plan: Plan,
  config: LineupConfig
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

    assignmentSlots(config, assignment).forEach(([role, name]) => {
      // Guests are not participants and carry no wishes to check.
      const participant = participantsByName.get(name);
      if (!participant) return;
      // An instrument combined with a singing role stays one assignment.
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
          `${formatDateGerman(date)}: ${name} (${role.label}) ist öfter eingeteilt als gewünscht (max. ${participant.max_per_month}×/Monat)`
        );
      }
    });

    // Covers both cases: nobody eligible was available and the admin cleared
    // the slot by hand.
    if (mdEnabled(config) && assignment.md === null)
      warnings.push(`${formatDateGerman(date)}: MD fehlt`);

    config.roles
      .filter((role) => !role.singing)
      .forEach((role) => {
        const count = (assignment.slots[role.id] ?? []).length;
        if (count >= role.min) return;
        warnings.push(
          role.min === 1
            ? `${formatDateGerman(date)}: ${role.label} fehlt`
            : `${formatDateGerman(date)}: Nur ${count} von ${role.min} ${role.label} gefunden`
        );
      });
  });

  return warnings.sort();
}

export function generatePlan(
  dates: string[],
  participants: Participant[],
  config: LineupConfig
): PlannerResult {
  const sortedDates = [...dates].sort();
  const state: PlannerState = {
    assignmentCounts: new Map(),
    lastAssignedDateIndex: new Map(),
    mdCounts: new Map(),
    monthlyAssignmentCounts: new Map(),
  };
  const plan: Plan = Object.fromEntries(
    sortedDates.map((date) => [date, emptyDateAssignment(config)])
  );
  const requiredRoles = config.roles.filter((role) => role.min > 0);
  const optionalRoles = config.roles.filter((role) => role.min === 0);

  // Pass 1: fill the required minimum of every role for every date,
  // balancing total load and avoiding back-to-back weeks where possible.
  // Within a fill group, the role with the fewest spare candidates goes
  // first, so a drummer who also plays keys is not used up on the keys while
  // the drums stay empty.
  sortedDates.forEach((date, dateIndex) => {
    const assignment = plan[date];
    for (;;) {
      const open = requiredRoles
        .map((role) => {
          const candidates = slotCandidates(
            participants,
            config,
            assignment,
            role,
            date,
            { yesOnly: false }
          );
          return {
            role,
            candidates,
            spare:
              candidates.free.length +
              candidates.doublers.length -
              (role.min - assignment.slots[role.id].length),
          };
        })
        .filter(
          ({ role, candidates }) =>
            assignment.slots[role.id].length < role.min &&
            candidates.free.length + candidates.doublers.length > 0
        );
      if (open.length === 0) break;
      const next = open.reduce((best, entry) => {
        const groupDifference = fillGroup(entry.role) - fillGroup(best.role);
        if (groupDifference !== 0) return groupDifference < 0 ? entry : best;
        return entry.spare < best.spare ? entry : best;
      });
      fillSlot(
        assignment,
        next.role,
        next.candidates,
        true,
        date,
        dateIndex,
        state
      );
    }
  });

  // Pass 2: fill optional extra slots of the required roles (e.g. a 2nd
  // e-guitar) with people who answered "yes", keeping the load balanced.
  // Pass 3: roles without a minimum (e.g. A-Guitar) last, so they can be
  // added to someone who is already scheduled.
  [requiredRoles, optionalRoles].forEach((roles) => {
    sortedDates.forEach((date, dateIndex) => {
      const assignment = plan[date];
      roles.forEach((role) => {
        while (assignment.slots[role.id].length < role.max) {
          const candidates = slotCandidates(
            participants,
            config,
            assignment,
            role,
            date,
            { yesOnly: true }
          );
          if (
            !fillSlot(assignment, role, candidates, false, date, dateIndex, state)
          )
            break;
        }
      });
    });
  });

  // Pass 4: pick a musical director per date from the people on an
  // MD-eligible slot that date.
  const participantsByName = new Map(
    participants.map((participant) => [participant.name, participant])
  );
  sortedDates.forEach((date) => {
    const assignment = plan[date];
    const mdCandidates = [
      ...new Set(
        config.roles
          .filter((role) => role.canMd)
          .flatMap((role) => assignment.slots[role.id])
      ),
    ]
      .map((name) => participantsByName.get(name))
      .filter(
        (participant): participant is Participant =>
          participant !== undefined && participant.can_md
      );
    const chosen = leastBusy(mdCandidates, state.mdCounts);
    if (chosen) {
      assignment.md = chosen.name;
      state.mdCounts.set(chosen.name, (state.mdCounts.get(chosen.name) ?? 0) + 1);
    }
  });

  return {
    plan,
    warnings: collectPlanWarnings(sortedDates, participants, plan, config),
  };
}
