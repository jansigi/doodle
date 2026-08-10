import type { DateAssignment, Plan } from "./types";
import { emptyDateAssignment } from "./types";
import { ROLE_LABELS } from "./roles";

export interface PlanChange {
  date: string;
  slot: string; // role label or "MD"
  description: string; // "Levi Marti → Jan Sigrist"
}

const OPEN_LABEL = "offen";

function personLabel(name: string | null): string {
  return name ?? OPEN_LABEL;
}

function singleSlotChanges(
  date: string,
  slot: string,
  before: string | null,
  after: string | null
): PlanChange[] {
  if (before === after) return [];
  return [
    {
      date,
      slot,
      description: `${personLabel(before)} → ${personLabel(after)}`,
    },
  ];
}

// Reordering a list is not a change. A swap within the same slot (one person
// out, another in) is reported as a single "A → B" instead of two entries.
function listSlotChanges(
  date: string,
  slot: string,
  before: string[],
  after: string[]
): PlanChange[] {
  const removed = before.filter((name) => !after.includes(name));
  const added = after.filter((name) => !before.includes(name));
  const swapCount = Math.min(removed.length, added.length);
  return [
    ...removed.slice(0, swapCount).map((name, index) => ({
      date,
      slot,
      description: `${name} → ${added[index]}`,
    })),
    ...removed.slice(swapCount).map((name) => ({
      date,
      slot,
      description: `${name} → ${OPEN_LABEL}`,
    })),
    ...added.slice(swapCount).map((name) => ({
      date,
      slot,
      description: `${OPEN_LABEL} → ${name}`,
    })),
  ];
}

function assignmentChanges(
  date: string,
  before: DateAssignment,
  after: DateAssignment
): PlanChange[] {
  return [
    ...singleSlotChanges(date, ROLE_LABELS.leader, before.leader, after.leader),
    ...listSlotChanges(date, ROLE_LABELS.vocal, before.vocals, after.vocals),
    ...singleSlotChanges(date, ROLE_LABELS.bass, before.bass, after.bass),
    ...listSlotChanges(date, ROLE_LABELS.egit, before.egit, after.egit),
    ...singleSlotChanges(
      date,
      ROLE_LABELS.aguitar,
      before.aguitar,
      after.aguitar
    ),
    ...singleSlotChanges(date, ROLE_LABELS.drums, before.drums, after.drums),
    ...singleSlotChanges(date, ROLE_LABELS.keys, before.keys, after.keys),
    ...singleSlotChanges(date, "MD", before.md, after.md),
  ];
}

// Difference between the stored plan and the edited one, in date order.
export function collectPlanChanges(
  dates: string[],
  before: Plan | null,
  after: Plan | null
): PlanChange[] {
  if (!after) return [];
  return [...dates]
    .sort()
    .flatMap((date) =>
      assignmentChanges(
        date,
        before?.[date] ?? emptyDateAssignment(),
        after[date] ?? emptyDateAssignment()
      )
    );
}
