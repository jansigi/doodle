export type Role =
  | "leader"
  | "coordinator"
  | "vocal"
  | "bass"
  | "egit"
  | "drums"
  | "keys";

export type Availability = "yes" | "maybe" | "no";

export type DoodleStatus = "open" | "closed";

export interface Doodle {
  id: string;
  title: string;
  status: DoodleStatus;
  dates: string[]; // ISO dates, sorted
  plan: Plan | null;
  warnings: string[] | null;
}

export interface Participant {
  id: string;
  doodle_id: string;
  name: string;
  roles: Role[];
  can_md: boolean;
  availability: Record<string, Availability>; // date -> availability
}

export interface DateAssignment {
  leader: string | null;
  coordinator: string | null;
  vocals: string[];
  bass: string | null;
  egit: string[];
  drums: string | null;
  keys: string | null;
  md: string | null; // name of the musical director (one of the assigned people)
}

export type Plan = Record<string, DateAssignment>; // date -> assignment

export function emptyDateAssignment(): DateAssignment {
  return {
    leader: null,
    coordinator: null,
    vocals: [],
    bass: null,
    egit: [],
    drums: null,
    keys: null,
    md: null,
  };
}
