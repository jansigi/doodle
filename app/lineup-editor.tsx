"use client";

import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LineupConfig, RoleConfig, RoleId } from "@/lib/types";
import {
  DEFAULT_LINEUP,
  MAX_PEOPLE_PER_ROLE,
  MAX_ROLE_LABEL_LENGTH,
  MAX_ROLES,
  formatRoleCount,
  lineupsEqual,
  parseLineupConfig,
} from "@/lib/roles";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  TabBar,
  ToggleChip,
  handleRadioKeys,
  panelId,
  tabId,
} from "./ui";

function peopleCount(role: RoleConfig): string {
  return `${formatRoleCount(role)} ${role.max === 1 ? "Person" : "Personen"}`;
}

function displayLabel(role: RoleConfig | undefined): string {
  return role?.label.trim() || "Neue Rolle";
}

// Singing roles first, like the columns of the plan.
function inPlanOrder(roles: RoleConfig[]): RoleConfig[] {
  return [
    ...roles.filter((role) => role.singing),
    ...roles.filter((role) => !role.singing),
  ];
}

function sortedPairs(
  roles: RoleConfig[],
  combinations: Array<[RoleId, RoleId]>
): Array<[RoleConfig, RoleConfig]> {
  const ordered = inPlanOrder(roles);
  const position = (id: RoleId) => ordered.findIndex((role) => role.id === id);
  return combinations
    .map(([a, b]): [RoleId, RoleId] => (position(a) <= position(b) ? [a, b] : [b, a]))
    .sort((x, y) => position(x[0]) - position(y[0]) || position(x[1]) - position(y[1]))
    .map(([a, b]): [RoleConfig, RoleConfig] => [
      ordered[position(a)],
      ordered[position(b)],
    ]);
}

// Read-only overview on the create page. Editing happens in the dialog, so
// the default lineup needs no interaction at all.
export function LineupSummary({
  config,
  onEdit,
  onReset,
}: {
  config: LineupConfig;
  onEdit: () => void;
  onReset: () => void;
}) {
  const isDefault = lineupsEqual(config, DEFAULT_LINEUP);
  const groups: Array<{ title: string; roles: RoleConfig[] }> = [
    { title: "Gesang", roles: config.roles.filter((role) => role.singing) },
    {
      title: "Instrumente",
      roles: config.roles.filter((role) => !role.singing),
    },
  ];
  const minSlots = config.roles.reduce((sum, role) => sum + role.min, 0);
  const maxSlots = config.roles.reduce((sum, role) => sum + role.max, 0);
  const pairs = sortedPairs(config.roles, config.combinations);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {isDefault ? "Standard-Besetzung" : "Angepasste Besetzung"}
          </p>
          <p className="text-xs tabular-nums text-slate-600">
            {minSlots === maxSlots ? minSlots : `${minSlots}-${maxSlots}`}{" "}
            Plätze pro Celebration
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw aria-hidden />
              Standard
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-secondary btn-sm"
          >
            <Pencil aria-hidden />
            Bearbeiten
          </button>
        </div>
      </div>
      {groups
        .filter((group) => group.roles.length > 0)
        .map((group) => (
          <div key={group.title} className="px-4 pb-1 pt-3">
            <p className="text-xs font-medium text-slate-500">{group.title}</p>
            <ul className="divide-y divide-slate-100">
              {group.roles.map((role) => (
                <li
                  key={role.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-800">
                      {role.label}
                    </span>
                    {role.canMd && (
                      <span className="badge badge-indigo">MD möglich</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-slate-600">
                    {peopleCount(role)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      <div className="border-t border-slate-100 px-4 py-3">
        <p className="text-xs font-medium text-slate-500">Kombinierbar</p>
        {pairs.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">
            Jede Person übernimmt pro Celebration genau eine Rolle.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pairs.map(([a, b]) => (
              <li key={`${a.id}|${b.id}`} className="badge badge-neutral">
                {a.label} + {b.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Only has to be unique within one lineup and match the id pattern the API
// accepts.
function newRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function newRole(singing: boolean): RoleConfig {
  return {
    id: newRoleId(),
    label: "",
    singing,
    min: 1,
    max: 1,
    // Most instruments can lead the band, singers usually do not.
    canMd: !singing,
  };
}

// Empty number inputs stay NaN while typing - the validation rejects them.
function parseCount(value: string): number {
  return value === "" ? Number.NaN : Number(value);
}

type EditorTab = "roles" | "combinations";

export function LineupEditorDialog({
  initial,
  onCancel,
  onApply,
}: {
  initial: LineupConfig;
  onCancel: () => void;
  onApply: (config: LineupConfig) => void;
}) {
  const [roles, setRoles] = useState<RoleConfig[]>(initial.roles);
  const [combinations, setCombinations] = useState<Array<[RoleId, RoleId]>>(
    initial.combinations
  );
  const [tab, setTab] = useState<EditorTab>("roles");
  const [focusRoleId, setFocusRoleId] = useState<string | null>(null);

  const parsed = parseLineupConfig({ roles, combinations });
  const error = "error" in parsed ? parsed.error : null;

  function updateRole(id: string, changes: Partial<RoleConfig>) {
    setRoles((current) =>
      current.map((role) => (role.id === id ? { ...role, ...changes } : role))
    );
  }

  // Keeps min <= max while typing, so the admin never has to fix the other
  // field by hand.
  function updateMin(role: RoleConfig, min: number) {
    updateRole(role.id, {
      min,
      max: Number.isNaN(min) ? role.max : Math.max(role.max, min),
    });
  }

  function updateMax(role: RoleConfig, max: number) {
    updateRole(role.id, {
      max,
      min: Number.isNaN(max) ? role.min : Math.min(role.min, max),
    });
  }

  // A removed role takes its combinations with it.
  function removeRole(id: string) {
    setRoles((current) => current.filter((role) => role.id !== id));
    setCombinations((current) => current.filter((pair) => !pair.includes(id)));
  }

  // Moves within the role's own group (singing or instruments).
  function moveRole(id: string, offset: -1 | 1) {
    setRoles((current) => {
      const role = current.find((candidate) => candidate.id === id);
      if (!role) return current;
      const group = current.filter(
        (candidate) => candidate.singing === role.singing
      );
      const index = group.indexOf(role);
      const target = group[index + offset];
      if (!target) return current;
      return current.map((candidate) =>
        candidate === role ? target : candidate === target ? role : candidate
      );
    });
  }

  function addRole(singing: boolean) {
    const role = newRole(singing);
    setRoles((current) => [...current, role]);
    setFocusRoleId(role.id);
  }

  function toggleCombination(a: RoleId, b: RoleId) {
    setCombinations((current) => {
      const exists = current.some(
        ([first, second]) =>
          (first === a && second === b) || (first === b && second === a)
      );
      return exists
        ? current.filter(
            ([first, second]) =>
              !((first === a && second === b) || (first === b && second === a))
          )
        : [...current, [a, b]];
    });
  }

  function apply() {
    if ("config" in parsed) onApply(parsed.config);
  }

  return (
    <Dialog labelledBy="lineup-editor-title" size="lg" onClose={onCancel}>
      <DialogHeader
        id="lineup-editor-title"
        title="Besetzung konfigurieren"
        description="Welche Rollen es gibt, wie viele Personen pro Celebration eingeteilt werden und wer mehrere Rollen gleichzeitig übernehmen darf."
        onClose={onCancel}
      />
      <div className="px-6">
        <TabBar
          tabs={[
            { id: "roles", label: "Rollen", count: roles.length },
            {
              id: "combinations",
              label: "Kombinationen",
              count: combinations.length,
            },
          ]}
          active={tab}
          idPrefix="lineup"
          label="Bereich"
          onSelect={setTab}
        />
      </div>

      <div
        role="tabpanel"
        id={panelId("lineup", tab)}
        aria-labelledby={tabId("lineup", tab)}
        className="flex-1 overflow-y-auto px-6 py-5 sm:min-h-[27rem]"
      >
        {tab === "roles" ? (
          <div className="space-y-7">
            <RoleGroupEditor
              title="Gesang"
              singing
              roles={roles.filter((role) => role.singing)}
              canAdd={roles.length < MAX_ROLES}
              focusRoleId={focusRoleId}
              onUpdate={updateRole}
              onUpdateMin={updateMin}
              onUpdateMax={updateMax}
              onMove={moveRole}
              onRemove={removeRole}
              onAdd={() => addRole(true)}
            />
            <RoleGroupEditor
              title="Instrumente"
              singing={false}
              roles={roles.filter((role) => !role.singing)}
              canAdd={roles.length < MAX_ROLES}
              focusRoleId={focusRoleId}
              onUpdate={updateRole}
              onUpdateMin={updateMin}
              onUpdateMax={updateMax}
              onMove={moveRole}
              onRemove={removeRole}
              onAdd={() => addRole(false)}
            />
            <dl className="grid gap-x-5 gap-y-2 rounded-lg bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-[auto_1fr]">
              <dt className="font-medium text-slate-800">Mind.</dt>
              <dd>
                Wird immer besetzt, wenn genug Leute können. Fehlt ein
                Instrument, erscheint ein Hinweis.
              </dd>
              <dt className="font-medium text-slate-800">Max.</dt>
              <dd>
                Weitere Plätze werden nur mit Leuten besetzt, die «Ja» gesagt
                haben.
              </dd>
              <dt className="font-medium text-slate-800">MD möglich</dt>
              <dd>Wer diese Rolle spielt, kann als MD eingeteilt werden.</dd>
            </dl>
          </div>
        ) : (
          <CombinationEditor
            roles={roles}
            combinations={combinations}
            onToggle={toggleCombination}
          />
        )}
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={() => {
            setRoles(DEFAULT_LINEUP.roles);
            setCombinations(DEFAULT_LINEUP.combinations);
          }}
          disabled={lineupsEqual({ roles, combinations }, DEFAULT_LINEUP)}
          className="btn btn-ghost btn-sm mr-auto"
        >
          <RotateCcw aria-hidden />
          Auf Standard zurücksetzen
        </button>
        {error && (
          <p
            role="alert"
            className="flex w-full items-start gap-1.5 text-sm text-red-700 sm:w-auto"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Abbrechen
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={error !== null}
          className="btn btn-primary"
        >
          Übernehmen
        </button>
      </DialogFooter>
    </Dialog>
  );
}

// Pick a role on the left, switch on everything it may be combined with on
// the right. The relation is symmetric, so every pair is edited from both
// sides and listed once below.
function CombinationEditor({
  roles,
  combinations,
  onToggle,
}: {
  roles: RoleConfig[];
  combinations: Array<[RoleId, RoleId]>;
  onToggle: (a: RoleId, b: RoleId) => void;
}) {
  const ordered = inPlanOrder(roles);
  const [selectedId, setSelectedId] = useState<RoleId | undefined>(
    ordered[0]?.id
  );
  const selected =
    ordered.find((role) => role.id === selectedId) ?? ordered[0];
  if (!selected)
    return (
      <p className="text-sm text-slate-600">
        Lege zuerst im Tab «Rollen» mindestens eine Rolle an.
      </p>
    );

  const groups = [
    { title: "Gesang", roles: ordered.filter((role) => role.singing) },
    { title: "Instrumente", roles: ordered.filter((role) => !role.singing) },
  ].filter((group) => group.roles.length > 0);
  const combined = (a: RoleId, b: RoleId) =>
    combinations.some(
      ([first, second]) =>
        (first === a && second === b) || (first === b && second === a)
    );
  const countFor = (id: RoleId) =>
    combinations.filter((pair) => pair.includes(id)).length;
  const pairs = sortedPairs(roles, combinations);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-slate-600">
        Normalerweise übernimmt jede Person pro Celebration genau eine Rolle.
        Lege hier fest, welche Rollen dieselbe Person am gleichen Termin
        zusammen übernehmen darf, zum Beispiel Worship Leader und A-Gitarre.
      </p>

      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div
          role="radiogroup"
          aria-label="Rolle wählen"
          onKeyDown={(event) =>
            handleRadioKeys(
              event,
              ordered.map((role) => role.id),
              selected.id,
              setSelectedId
            )
          }
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {groups.map((group) => (
            <Fragment key={group.title}>
              <p className="hidden px-2.5 pb-1 pt-3 text-xs font-medium text-slate-500 first:pt-0 sm:block">
                {group.title}
              </p>
              {group.roles.map((role) => {
                const isSelected = role.id === selected.id;
                const count = countFor(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setSelectedId(role.id)}
                    className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-900"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{displayLabel(role)}</span>
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 text-xs tabular-nums ${
                          isSelected
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div
          key={selected.id}
          className="animate-fade-in rounded-lg border border-slate-200 bg-white p-4 shadow-xs"
        >
          <p className="text-sm text-slate-600">
            Wer{" "}
            <span className="font-medium text-slate-900">
              {displayLabel(selected)}
            </span>{" "}
            übernimmt, darf am selben Termin auch:
          </p>
          <div className="mt-4 space-y-4">
            {groups.map((group) => {
              const others = group.roles.filter(
                (role) => role.id !== selected.id
              );
              if (others.length === 0) return null;
              return (
                <div key={group.title}>
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    {group.title}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {others.map((role) => (
                      <ToggleChip
                        key={role.id}
                        size="sm"
                        pressed={combined(selected.id, role.id)}
                        onClick={() => onToggle(selected.id, role.id)}
                      >
                        {displayLabel(role)}
                      </ToggleChip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-900">
          Alle Kombinationen{" "}
          <span className="font-normal tabular-nums text-slate-500">
            ({pairs.length})
          </span>
        </p>
        {pairs.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-600">
            Noch keine. Jede Person übernimmt pro Celebration genau eine Rolle.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {pairs.map(([a, b]) => (
              <li
                key={`${a.id}|${b.id}`}
                className="inline-flex h-8 animate-pop-in items-center gap-1.5 rounded-md border border-slate-200 bg-white pl-2.5 pr-0.5 text-sm text-slate-800 shadow-xs"
              >
                {displayLabel(a)}
                <Plus className="h-3 w-3 text-slate-400" aria-hidden />
                {displayLabel(b)}
                <button
                  type="button"
                  onClick={() => onToggle(a.id, b.id)}
                  aria-label={`Kombination ${displayLabel(a)} und ${displayLabel(b)} entfernen`}
                  className="grid h-7 w-7 place-items-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Minus and plus around a number field: quick to click, still typeable.
function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const valid = !Number.isNaN(value);
  const stepButton =
    "grid w-7 place-items-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="inline-flex h-9 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-indigo-500 focus-within:ring-[3px] focus-within:ring-indigo-500/15">
      {/* Keyboard users type or use the arrow keys in the field itself. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} verringern`}
        disabled={!valid || value <= min}
        onClick={() => onChange(value - 1)}
        className={stepButton}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        aria-label={label}
        value={valid ? value : ""}
        onChange={(event) => onChange(parseCount(event.target.value))}
        className="w-9 border-0 bg-transparent p-0 text-center text-sm tabular-nums text-slate-900 [appearance:textfield] focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} erhöhen`}
        disabled={!valid || value >= max}
        onClick={() => onChange(value + 1)}
        className={stepButton}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function RoleGroupEditor({
  title,
  singing,
  roles,
  canAdd,
  focusRoleId,
  onUpdate,
  onUpdateMin,
  onUpdateMax,
  onMove,
  onRemove,
  onAdd,
}: {
  title: string;
  singing: boolean;
  roles: RoleConfig[];
  canAdd: boolean;
  focusRoleId: string | null;
  onUpdate: (id: string, changes: Partial<RoleConfig>) => void;
  onUpdateMin: (role: RoleConfig, min: number) => void;
  onUpdateMax: (role: RoleConfig, max: number) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {roles.length > 0 && (
        <div className="-mx-1 overflow-x-auto px-1">
          {/* Fixed columns so both groups line up under each other. */}
          <table className="w-full min-w-[34rem] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="pb-1.5 pr-2 font-medium">Rolle</th>
                <th className="px-1 pb-1.5 text-center font-medium">Mind.</th>
                <th className="px-1 pb-1.5 text-center font-medium">Max.</th>
                <th className="px-1 pb-1.5 text-center font-medium">
                  MD möglich
                </th>
                <th className="pb-1.5">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, index) => {
                const name = displayLabel(role);
                return (
                  <tr key={role.id} className="animate-pop-in">
                    <td className="py-1 pr-2">
                      <input
                        className="input input-compact"
                        value={role.label}
                        maxLength={MAX_ROLE_LABEL_LENGTH}
                        placeholder={singing ? "z.B. Chor" : "z.B. Cello"}
                        aria-label="Name der Rolle"
                        autoFocus={role.id === focusRoleId}
                        onChange={(event) =>
                          onUpdate(role.id, { label: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <Stepper
                        value={role.min}
                        min={0}
                        max={MAX_PEOPLE_PER_ROLE}
                        label={`${name}: Mindestanzahl`}
                        onChange={(value) => onUpdateMin(role, value)}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <Stepper
                        value={role.max}
                        min={1}
                        max={MAX_PEOPLE_PER_ROLE}
                        label={`${name}: Höchstanzahl`}
                        onChange={(value) => onUpdateMax(role, value)}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={role.canMd}
                        aria-label={`${name}: MD möglich`}
                        onChange={(event) =>
                          onUpdate(role.id, { canMd: event.target.checked })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap py-1 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onMove(role.id, -1)}
                        disabled={index === 0}
                        aria-label={`${name} nach oben`}
                        title="Nach oben"
                        className="btn btn-ghost btn-icon"
                      >
                        <ArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(role.id, 1)}
                        disabled={index === roles.length - 1}
                        aria-label={`${name} nach unten`}
                        title="Nach unten"
                        className="btn btn-ghost btn-icon"
                      >
                        <ArrowDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(role.id)}
                        aria-label={`${name} entfernen`}
                        title="Entfernen"
                        className="btn btn-ghost btn-icon hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        className="btn btn-ghost btn-sm -ml-2.5 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
      >
        <Plus aria-hidden />
        {singing ? "Gesangsrolle hinzufügen" : "Instrument hinzufügen"}
      </button>
    </section>
  );
}
