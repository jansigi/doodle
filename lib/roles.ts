import type { LineupConfig, RoleConfig, RoleId } from "./types";

// The lineup every doodle used before it became configurable: 1 worship
// leader plus 4 additional vocals and one band. The ids double as the keys of
// the legacy plan format, so they must never change.
export const DEFAULT_LINEUP: LineupConfig = {
  roles: [
    {
      id: "leader",
      label: "Worship Leader",
      singing: true,
      min: 1,
      max: 1,
      canMd: false,
    },
    {
      id: "vocal",
      label: "Vocals",
      singing: true,
      min: 4,
      max: 4,
      canMd: false,
    },
    {
      id: "bass",
      label: "Bass",
      singing: false,
      min: 1,
      max: 1,
      canMd: true,
    },
    {
      id: "egit",
      label: "E-Gitarre",
      singing: false,
      min: 1,
      max: 2,
      canMd: true,
    },
    {
      // Optional, may double with a singing role, not MD-eligible.
      id: "aguitar",
      label: "A-Gitarre",
      singing: false,
      min: 0,
      max: 1,
      canMd: false,
    },
    {
      id: "drums",
      label: "Drums",
      singing: false,
      min: 1,
      max: 1,
      canMd: true,
    },
    {
      id: "keys",
      label: "Keys",
      singing: false,
      min: 1,
      max: 1,
      canMd: true,
    },
  ],
  combinations: [
    ["leader", "aguitar"],
    ["vocal", "aguitar"],
  ],
};

export const MAX_ROLES = 20;
export const MAX_PEOPLE_PER_ROLE = 20;
export const MAX_ROLE_LABEL_LENGTH = 40;

const ROLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function findRole(
  config: LineupConfig,
  roleId: RoleId
): RoleConfig | undefined {
  return config.roles.find((role) => role.id === roleId);
}

export function roleLabel(config: LineupConfig, roleId: RoleId): string {
  return findRole(config, roleId)?.label ?? roleId;
}

// Whether one person may hold both slots on the same date.
export function rolesCombinable(
  config: LineupConfig,
  a: RoleConfig,
  b: RoleConfig
): boolean {
  if (a.id === b.id) return false;
  return config.combinations.some(
    ([first, second]) =>
      (first === a.id && second === b.id) || (first === b.id && second === a.id)
  );
}

// Without a single MD-eligible role there is no MD to plan (and no hint
// about a missing one).
export function mdEnabled(config: LineupConfig): boolean {
  return config.roles.some((role) => role.canMd);
}

export function formatRoleCount(role: RoleConfig): string {
  return role.min === role.max ? `${role.min}` : `${role.min}-${role.max}`;
}

export function lineupsEqual(a: LineupConfig, b: LineupConfig): boolean {
  const pairKey = ([first, second]: [RoleId, RoleId]) =>
    [first, second].sort().join("|");
  const pairsA = new Set(a.combinations.map(pairKey));
  return (
    a.roles.length === b.roles.length &&
    a.roles.every((role, index) => {
      const other = b.roles[index];
      return (
        role.id === other.id &&
        role.label === other.label &&
        role.singing === other.singing &&
        role.min === other.min &&
        role.max === other.max &&
        role.canMd === other.canMd
      );
    }) &&
    a.combinations.length === b.combinations.length &&
    b.combinations.every((pair) => pairsA.has(pairKey(pair)))
  );
}

// Validates a lineup coming from the client and returns it in canonical form
// (trimmed labels, singing roles first). Shared by the editor, which shows
// the error inline, and the API, which rejects the request with it.
export function parseLineupConfig(
  raw: unknown
): { config: LineupConfig } | { error: string } {
  const rawRoles = (raw as { roles?: unknown } | null)?.roles;
  if (!Array.isArray(rawRoles) || rawRoles.length === 0)
    return { error: "Mindestens eine Rolle angeben" };
  if (rawRoles.length > MAX_ROLES)
    return { error: `Höchstens ${MAX_ROLES} Rollen möglich` };

  const roles: RoleConfig[] = [];
  for (const rawRole of rawRoles as Array<Record<string, unknown>>) {
    const id = typeof rawRole?.id === "string" ? rawRole.id : "";
    const label =
      typeof rawRole?.label === "string" ? rawRole.label.trim() : "";
    const { min, max } = rawRole ?? {};
    if (!ROLE_ID_PATTERN.test(id) || roles.some((role) => role.id === id))
      return { error: "Ungültige Rollen-Konfiguration" };
    if (!label) return { error: "Jede Rolle braucht einen Namen" };
    if (label.length > MAX_ROLE_LABEL_LENGTH)
      return {
        error: `Rollennamen dürfen höchstens ${MAX_ROLE_LABEL_LENGTH} Zeichen haben`,
      };
    if (
      roles.some(
        (role) => role.label.toLowerCase() === label.toLowerCase()
      )
    )
      return { error: `Die Rolle «${label}» gibt es zweimal` };
    if (
      !Number.isInteger(min) ||
      (min as number) < 0 ||
      (min as number) > MAX_PEOPLE_PER_ROLE
    )
      return {
        error: `${label}: Mindestanzahl muss zwischen 0 und ${MAX_PEOPLE_PER_ROLE} liegen`,
      };
    if (
      !Number.isInteger(max) ||
      (max as number) < 1 ||
      (max as number) > MAX_PEOPLE_PER_ROLE
    )
      return {
        error: `${label}: Höchstanzahl muss zwischen 1 und ${MAX_PEOPLE_PER_ROLE} liegen`,
      };
    if ((min as number) > (max as number))
      return {
        error: `${label}: Mindestanzahl ist grösser als die Höchstanzahl`,
      };
    roles.push({
      id,
      label,
      singing: Boolean(rawRole.singing),
      min: min as number,
      max: max as number,
      canMd: Boolean(rawRole.canMd),
    });
  }
  const orderedRoles = [
    ...roles.filter((role) => role.singing),
    ...roles.filter((role) => !role.singing),
  ];
  const position = new Map(orderedRoles.map((role, index) => [role.id, index]));

  // Lineups saved before pairs existed had a per-instrument flag that
  // allowed every singing role.
  const rawCombinations = (raw as { combinations?: unknown }).combinations;
  const requested: unknown[] = Array.isArray(rawCombinations)
    ? rawCombinations
    : (rawRoles as Array<Record<string, unknown>>)
        .filter((rawRole) => !rawRole.singing && rawRole.combinableWithSinging)
        .flatMap((instrument) =>
          orderedRoles
            .filter((role) => role.singing)
            .map((role) => [role.id, instrument.id])
        );

  const combinations: Array<[RoleId, RoleId]> = [];
  for (const pair of requested) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !position.has(pair[0]) ||
      !position.has(pair[1]) ||
      pair[0] === pair[1]
    )
      return { error: "Ungültige Kombination" };
    // Canonical order: the role that comes first in the plan first.
    const sorted = [...pair].sort(
      (x, y) => position.get(x)! - position.get(y)!
    ) as [RoleId, RoleId];
    if (
      !combinations.some(
        ([first, second]) => first === sorted[0] && second === sorted[1]
      )
    )
      combinations.push(sorted);
  }
  combinations.sort(
    (x, y) =>
      position.get(x[0])! - position.get(y[0])! ||
      position.get(x[1])! - position.get(y[1])!
  );

  return { config: { roles: orderedRoles, combinations } };
}

// Doodles created before the lineup became configurable have no stored
// config and keep planning with the default.
export function storedLineup(raw: unknown): LineupConfig {
  if (raw == null) return DEFAULT_LINEUP;
  const parsed = parseLineupConfig(raw);
  return "config" in parsed ? parsed.config : DEFAULT_LINEUP;
}

export function formatDateGerman(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
