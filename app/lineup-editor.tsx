"use client";

import { useEffect, useState } from "react";
import type { LineupConfig, RoleConfig } from "@/lib/types";
import {
  DEFAULT_LINEUP,
  MAX_PEOPLE_PER_ROLE,
  MAX_ROLE_LABEL_LENGTH,
  MAX_ROLES,
  formatRoleCount,
  lineupsEqual,
  parseLineupConfig,
} from "@/lib/roles";

function peopleCount(role: RoleConfig): string {
  return `${formatRoleCount(role)} ${role.max === 1 ? "Person" : "Personen"}`;
}

function RoleTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
      {children}
    </span>
  );
}

function MdTag() {
  return (
    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
      MD möglich
    </span>
  );
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Besetzung pro Celebration</p>
        <div className="flex items-center gap-3">
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-slate-500 hover:underline"
            >
              Standard wiederherstellen
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Bearbeiten
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        {groups
          .filter((group) => group.roles.length > 0)
          .map((group) => (
            <div key={group.title}>
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
              <ul className="divide-y divide-slate-100">
                {group.roles.map((role) => (
                  <li
                    key={role.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-800">
                        {role.label}
                      </span>
                      {role.canMd && <MdTag />}
                      {role.combinableWithSinging && (
                        <RoleTag>mit Gesang kombinierbar</RoleTag>
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
        <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          {isDefault ? "Standard-Besetzung" : "Angepasste Besetzung"} ·{" "}
          {minSlots === maxSlots ? minSlots : `${minSlots}-${maxSlots}`} Plätze
          pro Celebration
        </p>
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
    combinableWithSinging: false,
  };
}

// Empty number inputs stay NaN while typing - the validation rejects them.
function parseCount(value: string): number {
  return value === "" ? Number.NaN : Number(value);
}

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
  const [focusRoleId, setFocusRoleId] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const parsed = parseLineupConfig({ roles });
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

  function removeRole(id: string) {
    setRoles((current) => current.filter((role) => role.id !== id));
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

  function apply() {
    if ("config" in parsed) onApply(parsed.config);
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lineup-editor-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2
            id="lineup-editor-title"
            className="text-lg font-semibold text-slate-900"
          >
            Besetzung konfigurieren
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Welche Rollen es gibt und wie viele Personen pro Celebration
            eingeteilt werden. Die Band wählt beim Eintragen aus diesen Rollen.
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
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

          <dl className="grid gap-x-4 gap-y-1.5 rounded bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold text-slate-700">Mind.</dt>
            <dd>
              Wird immer besetzt, wenn genug Leute können. Fehlt ein
              Instrument, erscheint ein Hinweis.
            </dd>
            <dt className="font-semibold text-slate-700">Max.</dt>
            <dd>
              Weitere Plätze werden nur mit Leuten besetzt, die «Ja» gesagt
              haben.
            </dd>
            <dt className="font-semibold text-slate-700">MD möglich</dt>
            <dd>Wer diese Rolle spielt, kann als MD eingeteilt werden.</dd>
            <dt className="font-semibold text-slate-700">Mit Gesang</dt>
            <dd>
              Dieselbe Person kann gleichzeitig eine Gesangsrolle übernehmen,
              z.B. Worship Leader mit A-Gitarre.
            </dd>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={() => setRoles(DEFAULT_LINEUP.roles)}
            disabled={lineupsEqual({ roles }, DEFAULT_LINEUP)}
            className="text-sm text-slate-500 hover:underline disabled:opacity-40 disabled:hover:no-underline"
          >
            Auf Standard zurücksetzen
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {error && (
              <p role="alert" className="mr-auto text-sm text-red-600 sm:mr-2">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={error !== null}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
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
  const numberClass =
    "w-16 rounded border border-slate-300 px-2 py-1.5 text-center tabular-nums";
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {roles.length > 0 && (
        <div className="overflow-x-auto">
          {/* Fixed columns, including the singing-only gap, so both groups
              line up under each other. */}
          <table className="w-full min-w-[36rem] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="pb-1 pr-2 font-semibold">Rolle</th>
                <th className="px-1 pb-1 text-center font-semibold">Mind.</th>
                <th className="px-1 pb-1 text-center font-semibold">Max.</th>
                <th className="px-1 pb-1 text-center font-semibold">
                  MD möglich
                </th>
                <th className="px-1 pb-1 text-center font-semibold">
                  {!singing && "Mit Gesang"}
                </th>
                <th className="pb-1">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, index) => {
                const name = role.label.trim() || "Neue Rolle";
                return (
                  <tr key={role.id}>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1.5"
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
                      <input
                        type="number"
                        min={0}
                        max={MAX_PEOPLE_PER_ROLE}
                        className={numberClass}
                        value={Number.isNaN(role.min) ? "" : role.min}
                        aria-label={`${name}: Mindestanzahl`}
                        onChange={(event) =>
                          onUpdateMin(role, parseCount(event.target.value))
                        }
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="number"
                        min={1}
                        max={MAX_PEOPLE_PER_ROLE}
                        className={numberClass}
                        value={Number.isNaN(role.max) ? "" : role.max}
                        aria-label={`${name}: Höchstanzahl`}
                        onChange={(event) =>
                          onUpdateMax(role, parseCount(event.target.value))
                        }
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={role.canMd}
                        aria-label={`${name}: MD möglich`}
                        onChange={(event) =>
                          onUpdate(role.id, { canMd: event.target.checked })
                        }
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      {!singing && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-600"
                          checked={role.combinableWithSinging}
                          aria-label={`${name}: mit Gesang kombinierbar`}
                          onChange={(event) =>
                            onUpdate(role.id, {
                              combinableWithSinging: event.target.checked,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onMove(role.id, -1)}
                        disabled={index === 0}
                        aria-label={`${name} nach oben`}
                        className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(role.id, 1)}
                        disabled={index === roles.length - 1}
                        aria-label={`${name} nach unten`}
                        className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(role.id)}
                        aria-label={`${name} entfernen`}
                        className="rounded px-1.5 py-1 text-red-600 hover:bg-red-50"
                      >
                        ✕
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
        className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
      >
        {singing ? "+ Gesangsrolle hinzufügen" : "+ Instrument hinzufügen"}
      </button>
    </section>
  );
}
