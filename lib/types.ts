// Roles are configured per doodle, so a role is identified by the id from
// its lineup config (e.g. "bass" or a generated id for a custom instrument).
export type RoleId = string;

export type Availability = "yes" | "maybe" | "no";

export type DoodleStatus = "open" | "closed";

export interface RoleConfig {
  id: RoleId;
  label: string;
  // Singing roles (Worship Leader, Vocals) vs. instruments. Only instruments
  // raise a hint when they stay below their minimum.
  singing: boolean;
  // People per celebration. The minimum is always filled where possible,
  // slots above it only with people who answered "yes".
  min: number;
  max: number;
  // Whoever holds this slot may take the MD role.
  canMd: boolean;
  // Instruments only: the same person may hold this slot and a singing role
  // on the same date (e.g. a worship leader playing acoustic guitar).
  combinableWithSinging: boolean;
}

export interface LineupConfig {
  // Order is the column order in the plan, singing roles first.
  roles: RoleConfig[];
}

export interface Doodle {
  id: string;
  title: string;
  status: DoodleStatus;
  dates: string[]; // ISO dates, sorted
  config: LineupConfig;
  plan: Plan | null;
  warnings: string[] | null;
}

export interface Participant {
  id: string;
  doodle_id: string;
  name: string;
  roles: RoleId[];
  can_md: boolean;
  // Wish: at most this many assignments per calendar month (null = no limit).
  max_per_month: number | null;
  availability: Record<string, Availability>; // date -> availability
}

export interface DateAssignment {
  // role id -> assigned names in slot order. A person may appear in two
  // slots of the same date only if one is a singing role and the other an
  // instrument that is combinable with singing.
  slots: Record<RoleId, string[]>;
  md: string | null; // name of the musical director (one of the assigned people)
}

export type Plan = Record<string, DateAssignment>; // date -> assignment

export function emptyDateAssignment(config: LineupConfig): DateAssignment {
  return {
    slots: Object.fromEntries(config.roles.map((role) => [role.id, []])),
    md: null,
  };
}
