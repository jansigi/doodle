"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type {
  Availability,
  DateAssignment,
  LineupConfig,
  Plan,
  RoleConfig,
  RoleId,
} from "@/lib/types";
import {
  formatDateGerman,
  mdEnabled,
  roleLabel,
  rolesCombinable,
} from "@/lib/roles";
import type { PersonPlanStats } from "@/lib/stats";
import { collectPlanStats, median } from "@/lib/stats";
import type { PlanChange } from "@/lib/plan-diff";
import { collectPlanChanges } from "@/lib/plan-diff";
import { downloadAvailabilityCsv } from "@/lib/csv";
import { downloadAvailabilityExcel } from "@/lib/excel";
import { downloadPlanPdf } from "@/lib/pdf";

interface AdminParticipant {
  name: string;
  roles: RoleId[];
  can_md: boolean;
  max_per_month: number | null;
  availability: Record<string, Availability>;
}

interface AdminDoodle {
  id: string;
  title: string;
  status: "open" | "closed";
  dates: string[];
  config: LineupConfig;
  plan: Plan | null;
  warnings: string[] | null;
}

// Sentinel option value that opens a free-text prompt (guests etc.).
const CUSTOM_NAME_OPTION = "__custom__";

const AVAILABILITY_SYMBOLS: Record<Availability, string> = {
  yes: "✓",
  maybe: "?",
  no: "✗",
};

const AVAILABILITY_CLASSES: Record<Availability, string> = {
  yes: "bg-green-100 text-green-800",
  maybe: "bg-amber-100 text-amber-800",
  no: "bg-red-100 text-red-700",
};

type AdminTab = "plan" | "stats" | "availability";

const TAB_LABELS: Record<AdminTab, string> = {
  plan: "Plan",
  stats: "Einsätze",
  availability: "Verfügbarkeiten",
};

export default function AdminPage() {
  const { id } = useParams<{ id: string }>();
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [doodle, setDoodle] = useState<AdminDoodle | null>(null);
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("plan");
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{ plan: Plan } | null>(
    null
  );
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  useEffect(() => {
    const storedPassword = sessionStorage.getItem(`doodle-admin-${id}`);
    if (storedPassword) {
      setPassword(storedPassword);
      callAdmin("login", storedPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Counts down the undo window after a plan regeneration; the snapshot is
  // dropped once it reaches zero so the toast disappears and the overwrite
  // becomes final.
  useEffect(() => {
    if (!undoSnapshot) return;
    if (undoSecondsLeft <= 0) {
      setUndoSnapshot(null);
      return;
    }
    const timer = setTimeout(
      () => setUndoSecondsLeft((seconds) => seconds - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [undoSnapshot, undoSecondsLeft]);

  useEffect(() => {
    if (!showRegenerateConfirm && !showSaveConfirm) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShowRegenerateConfirm(false);
      setShowSaveConfirm(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRegenerateConfirm, showSaveConfirm]);

  async function callAdmin(
    action: string,
    passwordOverride?: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    setError(null);
    setBusy(true);
    const usedPassword = passwordOverride ?? password;
    const response = await fetch(`/api/doodles/${id}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: usedPassword, action, ...extra }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Unbekannter Fehler");
      if (response.status === 401)
        sessionStorage.removeItem(`doodle-admin-${id}`);
      return false;
    }
    sessionStorage.setItem(`doodle-admin-${id}`, usedPassword);
    setLoggedIn(true);
    setDoodle(result.doodle);
    setParticipants(result.participants);
    setPlan(result.doodle.plan);
    return true;
  }

  async function handleSaveConfirm() {
    setShowSaveConfirm(false);
    await callAdmin("updatePlan", undefined, { plan });
  }

  async function handleRegenerateConfirm() {
    setShowRegenerateConfirm(false);
    const snapshot = doodle?.plan ? { plan: doodle.plan } : null;
    const success = await callAdmin("regenerate");
    if (success && snapshot) {
      setUndoSnapshot(snapshot);
      setUndoSecondsLeft(10);
    }
  }

  async function handleUndoRegenerate() {
    if (!undoSnapshot) return;
    const { plan: previousPlan } = undoSnapshot;
    setUndoSnapshot(null);
    // The hints belonging to the restored plan are derived server-side.
    await callAdmin("updatePlan", undefined, { plan: previousPlan });
  }

  function updateAssignment(date: string, updated: DateAssignment) {
    if (!plan) return;
    setPlan({ ...plan, [date]: updated });
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Admin-Bereich</h1>
        <input
          type="password"
          className="w-full rounded border border-slate-300 px-3 py-2"
          placeholder="Admin-Passwort"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && callAdmin("login")}
        />
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="button"
          onClick={() => callAdmin("login")}
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Anmelden
        </button>
      </div>
    );
  }

  if (!doodle) return <p className="text-slate-500">Lädt…</p>;

  // Everything the admin changed since the last save. Editing a slot back to
  // its stored value makes it disappear from this list again.
  const planChanges = collectPlanChanges(
    doodle.dates,
    doodle.plan,
    plan,
    doodle.config
  );

  return (
    // Flex column instead of space-y: the fixed overlays below are out of
    // flow, so they get no gap - `space-y-*` would give them a top margin and
    // shift the whole backdrop down.
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{doodle.title}</h1>
          <p className="text-slate-500">
            Status:{" "}
            <span
              className={
                doodle.status === "open" ? "text-green-700" : "text-amber-700"
              }
            >
              {doodle.status === "open" ? "Offen" : "Geschlossen"}
            </span>{" "}
            · {participants.length} Personen eingetragen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doodle.status === "open" ? (
            <button
              type="button"
              onClick={() => callAdmin("close")}
              disabled={busy}
              className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {/* An existing plan survives closing - only the first close
                  creates one. */}
              {plan ? "Schliessen" : "Schliessen & Plan erstellen"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => callAdmin("reopen")}
                disabled={busy}
                className="rounded border border-slate-300 bg-white px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
              >
                Wieder öffnen
              </button>
              {/* Amber, like the confirmation dialog: this overwrites the
                  whole plan and should not read as a harmless action. */}
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(true)}
                disabled={busy}
                className="rounded border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Plan neu generieren
              </button>
            </>
          )}
          {planChanges.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveConfirm(true)}
              disabled={busy}
              className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              {planChanges.length === 1
                ? "1 Änderung speichern"
                : `${planChanges.length} Änderungen speichern`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {/* Without a plan there is only one thing to look at, so the tab bar
          would just be noise. */}
      {plan && (
        <TabBar active={activeTab} onSelect={setActiveTab} />
      )}

      {plan && activeTab === "plan" && (
        <div
          role="tabpanel"
          id="panel-plan"
          aria-labelledby="tab-plan"
          className="space-y-6"
        >
          {doodle.warnings && doodle.warnings.length > 0 && (
            <WarningsAccordion warnings={doodle.warnings} />
          )}
          <PlanEditor
            dates={doodle.dates}
            config={doodle.config}
            plan={plan}
            participants={participants}
            onDownloadPdf={() =>
              downloadPlanPdf(doodle.title, plan, doodle.config)
            }
            onChange={updateAssignment}
          />
        </div>
      )}

      {plan && activeTab === "stats" && (
        <div role="tabpanel" id="panel-stats" aria-labelledby="tab-stats">
          <PlanStatistics
            dates={doodle.dates}
            config={doodle.config}
            plan={plan}
            participants={participants}
          />
        </div>
      )}

      {(!plan || activeTab === "availability") && (
        <div
          role="tabpanel"
          id="panel-availability"
          aria-labelledby="tab-availability"
        >
          <AvailabilityMatrix
            title={doodle.title}
            doodleId={doodle.id}
            status={doodle.status}
            dates={doodle.dates}
            config={doodle.config}
            participants={participants}
            busy={busy}
            onDelete={(participantName) => {
              const confirmed = window.confirm(
                `Bist du sicher, dass du den Eintrag von «${participantName}» löschen möchtest? Das kann nicht rückgängig gemacht werden.`
              );
              if (confirmed)
                callAdmin("deleteParticipant", undefined, { participantName });
            }}
          />
        </div>
      )}

      {showRegenerateConfirm && (
        <RegenerateConfirmDialog
          changeCount={planChanges.length}
          onCancel={() => setShowRegenerateConfirm(false)}
          onConfirm={handleRegenerateConfirm}
        />
      )}

      {showSaveConfirm && (
        <SaveConfirmDialog
          changes={planChanges}
          onCancel={() => setShowSaveConfirm(false)}
          onConfirm={handleSaveConfirm}
        />
      )}

      {undoSnapshot && (
        <UndoToast
          secondsLeft={undoSecondsLeft}
          onUndo={handleUndoRegenerate}
        />
      )}
    </div>
  );
}

// The three views of the admin page are large tables - showing them one at a
// time keeps the page scannable.
function TabBar({
  active,
  onSelect,
}: {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
}) {
  const tabs: AdminTab[] = ["plan", "stats", "availability"];

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const next = (tabs.indexOf(active) + offset + tabs.length) % tabs.length;
    onSelect(tabs[next]);
    document.getElementById(`tab-${tabs[next]}`)?.focus();
  }

  return (
    <div className="border-b border-slate-200">
      <div
        role="tablist"
        aria-label="Ansicht"
        onKeyDown={handleKeyDown}
        className="-mb-px flex gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`tab-${tab}`}
              aria-selected={selected}
              aria-controls={`panel-${tab}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RegenerateConfirmDialog({
  changeCount,
  onCancel,
  onConfirm,
}: {
  changeCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="regenerate-confirm-title"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="regenerate-confirm-title"
          className="text-lg font-semibold text-slate-900"
        >
          Plan wirklich neu generieren?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Der komplette Plan wird überschrieben und durch eine neue
          Zuteilung ersetzt. Bereits gespeicherte Änderungen gehen dabei
          verloren.
        </p>
        {changeCount > 0 && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            {changeCount === 1
              ? "Du hast 1 ungespeicherte Änderung im Plan - auch diese geht verloren."
              : `Du hast ${changeCount} ungespeicherte Änderungen im Plan - auch diese gehen verloren.`}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            OK, Plan überschreiben
          </button>
        </div>
      </div>
    </div>
  );
}

// Saving is confirmed the same way as regenerating, but here the dialog can
// name every change instead of just warning about them.
function SaveConfirmDialog({
  changes,
  onCancel,
  onConfirm,
}: {
  changes: PlanChange[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-confirm-title"
        className="flex w-full max-w-lg flex-col rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="save-confirm-title"
          className="text-lg font-semibold text-slate-900"
        >
          {changes.length === 1
            ? "1 Änderung speichern?"
            : `${changes.length} Änderungen speichern?`}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Diese Anpassungen werden in den Plan übernommen. Die Hinweise werden
          dabei neu berechnet.
        </p>
        <ul className="mt-4 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200">
          {changes.map((change, index) => (
            <li
              key={`${change.date}-${change.slot}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-sm"
            >
              <span className="whitespace-nowrap font-medium text-slate-800">
                {formatDateGerman(change.date).slice(0, -5)}
              </span>
              <span className="whitespace-nowrap text-xs uppercase tracking-wider text-slate-400">
                {change.slot}
              </span>
              <span className="text-slate-600">{change.description}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
          >
            OK, speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function UndoToast({
  secondsLeft,
  onUndo,
}: {
  secondsLeft: number;
  onUndo: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
      <span>Plan wurde neu generiert.</span>
      <button
        type="button"
        onClick={onUndo}
        className="rounded bg-white/10 px-3 py-1 font-semibold hover:bg-white/20"
      >
        Rückgängig ({secondsLeft}s)
      </button>
    </div>
  );
}

function WarningsAccordion({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleWarnings = expanded ? warnings : warnings.slice(0, 5);
  const hiddenCount = warnings.length - visibleWarnings.length;
  return (
    <section className="rounded border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 font-semibold text-amber-900">
        Hinweise ({warnings.length})
      </h2>
      <ul className="list-inside list-disc space-y-1 text-sm text-amber-900">
        {visibleWarnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      {warnings.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm font-medium text-amber-900 underline hover:no-underline"
        >
          {expanded ? "Weniger anzeigen" : `Alle anzeigen (${hiddenCount} weitere)`}
        </button>
      )}
    </section>
  );
}

function PlanEditor({
  dates,
  config,
  plan,
  participants,
  onDownloadPdf,
  onChange,
}: {
  dates: string[];
  config: LineupConfig;
  plan: Plan;
  participants: AdminParticipant[];
  onDownloadPdf: () => void;
  onChange: (date: string, updated: DateAssignment) => void;
}) {
  const showMd = mdEnabled(config);
  const columnCount = config.roles.length + (showMd ? 1 : 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {dates.length} Termine · Änderungen werden erst mit «Änderungen
          speichern» übernommen
        </p>
        <button
          type="button"
          onClick={onDownloadPdf}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          PDF herunterladen
        </button>
      </div>
      {/* Full-bleed: the plan table uses the entire viewport width so all
          role columns stay visible. */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table
            className="w-full text-sm"
            // Enough room per column for a name with its status dot.
            style={{ minWidth: `${(columnCount + 1) * 140}px` }}
          >
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-3 font-semibold">Datum</th>
              {config.roles.map((role) => (
                <th key={role.id} className="px-3 py-3 font-semibold">
                  {role.label}
                </th>
              ))}
              {showMd && <th className="px-3 py-3 font-semibold">MD</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dates.map((date) => {
              const assignment = plan[date];
              if (!assignment) return null;
              return (
                <PlanRow
                  key={date}
                  date={date}
                  config={config}
                  showMd={showMd}
                  assignment={assignment}
                  participants={participants}
                  onChange={(updated) => onChange(date, updated)}
                />
              );
            })}
          </tbody>
          </table>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> verfügbar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> vielleicht
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" /> nicht verfügbar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-dashed border-slate-300" />{" "}
          offen
        </span>
      </p>
    </section>
  );
}

function PlanRow({
  date,
  config,
  showMd,
  assignment,
  participants,
  onChange,
}: {
  date: string;
  config: LineupConfig;
  showMd: boolean;
  assignment: DateAssignment;
  participants: AdminParticipant[];
  onChange: (updated: DateAssignment) => void;
}) {
  const slots = config.roles.flatMap((role) =>
    (assignment.slots[role.id] ?? []).map((name, index) => ({
      role,
      index,
      name,
    }))
  );

  function holdsMdSlot(updated: DateAssignment, name: string): boolean {
    return config.roles.some(
      (role) => role.canMd && (updated.slots[role.id] ?? []).includes(name)
    );
  }

  // Only people on an MD-eligible slot can be MD.
  const mdCandidates = participants.filter(
    (participant) =>
      participant.can_md && holdsMdSlot(assignment, participant.name)
  );

  function roleSelects(role: RoleConfig) {
    const values = assignment.slots[role.id] ?? [];
    const slotCount = Math.max(role.max, values.length);
    return (
      <div className="space-y-1">
        {Array.from({ length: slotCount }).map((_, index) => (
          <PersonSelect
            key={index}
            date={date}
            role={role.id}
            value={values[index] ?? null}
            participants={participants}
            // Everyone holding another slot that date is blocked, unless that
            // slot combines with this one (singing plus an instrument that
            // allows it).
            excluded={slots
              .filter(
                (slot) => !(slot.role.id === role.id && slot.index === index)
              )
              .filter((slot) => !rolesCombinable(slot.role, role))
              .map((slot) => slot.name)}
            onSelect={(name) => {
              const updatedValues = [...values];
              if (name === null) updatedValues.splice(index, 1);
              else updatedValues[index] = name;
              const updated: DateAssignment = {
                ...assignment,
                slots: {
                  ...assignment.slots,
                  [role.id]: updatedValues.filter(Boolean),
                },
              };
              // The MD keeps the role as long as they still hold another
              // MD-eligible slot (e.g. they only stopped singing).
              if (
                assignment.md !== null &&
                values[index] === assignment.md &&
                name !== assignment.md &&
                !holdsMdSlot(updated, assignment.md)
              )
                updated.md = null;
              onChange(updated);
            }}
          />
        ))}
      </div>
    );
  }

  const dateObject = new Date(date + "T00:00:00");
  return (
    <tr className="align-top transition-colors hover:bg-slate-50/70">
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {dateObject.toLocaleDateString("de-CH", { weekday: "long" })}
        </span>
        <span className="font-semibold text-slate-800">
          {dateObject.toLocaleDateString("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      </td>
      {config.roles.map((role) => (
        <td key={role.id} className="px-3 py-2">
          {roleSelects(role)}
        </td>
      ))}
      {showMd && (
        <td className="px-3 py-2">
          <StatusSelect
            value={assignment.md ?? ""}
            status={null}
            accentDotClass="bg-indigo-500"
            onChange={(selected) => {
              if (selected === CUSTOM_NAME_OPTION) {
                const entered = window.prompt("Name eingeben:")?.trim();
                if (entered) onChange({ ...assignment, md: entered });
                return;
              }
              onChange({ ...assignment, md: selected || null });
            }}
          >
            <option value="">offen</option>
            {assignment.md !== null &&
              !mdCandidates.some(
                (candidate) => candidate.name === assignment.md
              ) && (
                <option value={assignment.md}>{assignment.md} (Gast)</option>
              )}
            {mdCandidates.map((candidate) => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
            <option value={CUSTOM_NAME_OPTION}>✎ Anderer Name…</option>
          </StatusSelect>
        </td>
      )}
    </tr>
  );
}

// Every column of the statistics table can be sorted by. Role columns are
// prefixed so a configured role id can never collide with the fixed ones.
type StatsColumn = "name" | "dateCount" | "mdCount" | `role:${RoleId}`;

function statsValue(person: PersonPlanStats, column: StatsColumn): number {
  if (column === "dateCount") return person.dateCount;
  if (column === "mdCount") return person.mdCount;
  if (column === "name") return 0;
  return person.roleCounts[column.slice("role:".length)] ?? 0;
}

function StatsHeaderCell({
  column,
  label,
  align,
  sort,
  onSort,
}: {
  column: StatsColumn;
  label: string;
  align: "left" | "center";
  sort: { column: StatsColumn; ascending: boolean };
  onSort: (column: StatsColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.ascending ? "ascending" : "descending") : "none"
      }
      className="whitespace-nowrap px-3 py-3 font-semibold"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex w-full items-center gap-1 uppercase tracking-wider transition-colors hover:text-slate-800 ${
          align === "center" ? "justify-center" : "justify-start"
        } ${active ? "text-indigo-700" : ""}`}
      >
        {label}
        <span
          aria-hidden
          className={`text-[10px] ${active ? "" : "text-slate-300"}`}
        >
          {active ? (sort.ascending ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

// Overview of how often each person plays which instrument in the current
// plan. It reads from the edited plan state, so manual changes above are
// reflected immediately.
function PlanStatistics({
  dates,
  config,
  plan,
  participants,
}: {
  dates: string[];
  config: LineupConfig;
  plan: Plan;
  participants: AdminParticipant[];
}) {
  // Names ascending by default, counts descending on first click - that is
  // the direction someone clicking a count column is looking for.
  const [sort, setSort] = useState<{ column: StatsColumn; ascending: boolean }>(
    { column: "name", ascending: true }
  );
  const stats = collectPlanStats(
    plan,
    dates,
    participants.map((participant) => participant.name),
    config
  );
  if (stats.length === 0) return null;

  const showMd = mdEnabled(config);
  // Slots that come on top of another one on the same date and therefore add
  // no celebration of their own.
  const extraSlotLabels = [
    ...(showMd ? ["MD"] : []),
    ...(config.roles.some((role) => role.combinableWithSinging)
      ? [
          `${config.roles
            .filter((role) => role.combinableWithSinging)
            .map((role) => role.label)
            .join(" oder ")} in Kombination mit einer Gesangsrolle`,
        ]
      : []),
  ];

  const dateCounts = stats.map((person) => person.dateCount);
  const maxDateCount = Math.max(...dateCounts);
  const totalAssignments = dateCounts.reduce((sum, count) => sum + count, 0);
  const medianCount = median(dateCounts);

  const sortedStats = [...stats].sort((a, b) => {
    const direction = sort.ascending ? 1 : -1;
    if (sort.column === "name")
      return direction * a.name.localeCompare(b.name, "de-CH");
    const difference = statsValue(a, sort.column) - statsValue(b, sort.column);
    // Equal counts stay alphabetical so the order never looks random.
    return difference !== 0
      ? direction * difference
      : a.name.localeCompare(b.name, "de-CH");
  });

  function toggleSort(column: StatsColumn) {
    setSort((current) =>
      current.column === column
        ? { column, ascending: !current.ascending }
        : { column, ascending: column === "name" }
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-500">
        {totalAssignments} Einsätze auf {stats.length} Personen · Median{" "}
        {Number.isInteger(medianCount)
          ? medianCount
          : medianCount.toFixed(1)}{" "}
        pro Person
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <StatsHeaderCell
                column="name"
                label="Person"
                align="left"
                sort={sort}
                onSort={toggleSort}
              />
              <StatsHeaderCell
                column="dateCount"
                label="Einsätze"
                align="left"
                sort={sort}
                onSort={toggleSort}
              />
              {config.roles.map((role) => (
                <StatsHeaderCell
                  key={role.id}
                  column={`role:${role.id}`}
                  label={role.label}
                  align="center"
                  sort={sort}
                  onSort={toggleSort}
                />
              ))}
              {showMd && (
                <StatsHeaderCell
                  column="mdCount"
                  label="MD"
                  align="center"
                  sort={sort}
                  onSort={toggleSort}
                />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedStats.map((person) => (
              <tr
                key={person.name}
                className="transition-colors hover:bg-slate-50/70"
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                  {person.name}
                  {person.isGuest && (
                    <span className="ml-1 rounded bg-slate-100 px-1 text-xs font-normal text-slate-500">
                      Gast
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 text-right font-semibold tabular-nums ${
                        person.dateCount === 0
                          ? "text-slate-300"
                          : "text-slate-800"
                      }`}
                    >
                      {person.dateCount}
                    </span>
                    {/* Bar makes an unfair distribution visible at a glance. */}
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${
                            maxDateCount === 0
                              ? 0
                              : (person.dateCount / maxDateCount) * 100
                          }%`,
                        }}
                      />
                    </span>
                  </div>
                </td>
                {config.roles.map((role) => (
                  <StatCountCell
                    key={role.id}
                    count={person.roleCounts[role.id] ?? 0}
                  />
                ))}
                {showMd && <StatCountCell count={person.mdCount} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extraSlotLabels.length > 0 && (
        <p className="text-xs text-slate-500">
          «Einsätze» zählt Termine, nicht Slots: {extraSlotLabels.join(" und ")}{" "}
          {extraSlotLabels.length === 1 ? "ergibt" : "ergeben"} keinen
          zusätzlichen Einsatz.
        </p>
      )}
    </section>
  );
}

function StatCountCell({ count }: { count: number }) {
  return (
    <td className="px-3 py-2 text-center tabular-nums">
      {count === 0 ? (
        <span className="text-slate-300">·</span>
      ) : (
        <span className="font-medium text-slate-800">{count}</span>
      )}
    </td>
  );
}

// Availability is shown inside the control itself: a colored status dot plus
// a soft tint, so an assigned person reads as one coherent pill.
const SELECT_STATUS_STYLES: Record<
  Availability,
  { dot: string; control: string }
> = {
  yes: {
    dot: "bg-green-500",
    control: "border-green-200 bg-green-50 text-green-950",
  },
  maybe: {
    dot: "bg-amber-400",
    control: "border-amber-300 bg-amber-50 text-amber-950",
  },
  no: {
    dot: "bg-red-400",
    control: "border-red-300 bg-red-50 text-red-950",
  },
};

function StatusSelect({
  value,
  status,
  accentDotClass,
  children,
  onChange,
}: {
  value: string;
  status: Availability | null;
  accentDotClass?: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  const assigned = value !== "";
  // status === null with a value means a free-text entry (guest) without
  // availability data - shown neutrally instead of red.
  const neutralDot = "bg-slate-400";
  const neutralControl = "border-slate-300 bg-slate-50 text-slate-900";
  const dotClass = assigned
    ? accentDotClass ??
      (status === null ? neutralDot : SELECT_STATUS_STYLES[status].dot)
    : "border border-dashed border-slate-300 bg-transparent";
  const controlClass = assigned
    ? accentDotClass
      ? "border-indigo-200 bg-indigo-50 text-indigo-950"
      : status === null
        ? neutralControl
        : SELECT_STATUS_STYLES[status].control
    : "border-dashed border-slate-300 bg-white text-slate-400";
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${dotClass}`}
      />
      <select
        className={`w-full cursor-pointer appearance-none rounded-md border py-1.5 pl-7 pr-7 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${controlClass}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
        ▾
      </span>
    </div>
  );
}

function PersonSelect({
  date,
  role,
  value,
  participants,
  excluded,
  onSelect,
}: {
  date: string;
  role: RoleId;
  value: string | null;
  participants: AdminParticipant[];
  excluded: string[];
  onSelect: (name: string | null) => void;
}) {
  const options = participants.filter(
    (participant) =>
      participant.roles.includes(role) && !excluded.includes(participant.name)
  );
  // A value that is no participant is a free-text entry (e.g. a guest).
  const isCustomValue =
    value !== null &&
    !participants.some((participant) => participant.name === value);
  const currentAvailability =
    value !== null && !isCustomValue
      ? participants.find((participant) => participant.name === value)
          ?.availability[date] ?? "no"
      : null;

  return (
    <StatusSelect
      value={value ?? ""}
      status={currentAvailability}
      onChange={(selected) => {
        if (selected === CUSTOM_NAME_OPTION) {
          const entered = window.prompt("Name eingeben:")?.trim();
          if (entered) onSelect(entered);
          return;
        }
        onSelect(selected || null);
      }}
    >
      <option value="">offen</option>
      {isCustomValue && <option value={value}>{value} (Gast)</option>}
      {options.map((participant) => {
        const availability = participant.availability[date] ?? "no";
        return (
          <option key={participant.name} value={participant.name}>
            {participant.name} {AVAILABILITY_SYMBOLS[availability]}
          </option>
        );
      })}
      <option value={CUSTOM_NAME_OPTION}>✎ Anderer Name…</option>
    </StatusSelect>
  );
}

// Export picker for the availability table: Excel by default, CSV for
// whoever needs the raw data.
function DownloadMenu({
  busy,
  onSelect,
}: {
  busy: boolean;
  onSelect: (format: "excel" | "csv") => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node))
        setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const options: Array<{ format: "excel" | "csv"; label: string; hint: string }> =
    [
      { format: "excel", label: "Excel", hint: ".xlsx" },
      { format: "csv", label: "CSV", hint: ".csv" },
    ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? "Datei wird erstellt…" : "Herunterladen"}
        <span aria-hidden className="text-xs text-slate-400">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(option.format);
              }}
              className="flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              {option.label}
              <span className="text-xs text-slate-400">{option.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AvailabilityMatrix({
  title,
  doodleId,
  status,
  dates,
  config,
  participants,
  busy,
  onDelete,
}: {
  title: string;
  doodleId: string;
  status: "open" | "closed";
  dates: string[];
  config: LineupConfig;
  participants: AdminParticipant[];
  busy: boolean;
  onDelete: (participantName: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  if (participants.length === 0)
    return (
      <p className="text-slate-500">Noch hat sich niemand eingetragen.</p>
    );

  async function handleDownload(format: "excel" | "csv") {
    setExporting(true);
    try {
      if (format === "excel")
        await downloadAvailabilityExcel(title, dates, participants, config);
      else downloadAvailabilityCsv(title, dates, participants, config);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {participants.length} Personen · {dates.length} Termine
        </p>
        <DownloadMenu busy={exporting} onSelect={handleDownload} />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Rollen</th>
              {dates.map((date) => (
                <th
                  key={date}
                  className="whitespace-nowrap px-2 py-2 text-center font-normal"
                >
                  {formatDateGerman(date).slice(0, -5)}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {participants.map((participant) => (
              <tr key={participant.name}>
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {participant.name}
                  {participant.can_md && (
                    <span className="ml-1 rounded bg-indigo-100 px-1 text-xs text-indigo-700">
                      MD
                    </span>
                  )}
                  {participant.max_per_month != null && (
                    <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600">
                      max. {participant.max_per_month}×/Mt.
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {participant.roles
                    .map((role) => roleLabel(config, role))
                    .join(", ")}
                </td>
                {dates.map((date) => {
                  const availability = participant.availability[date];
                  return (
                    <td key={date} className="px-2 py-2 text-center">
                      {availability ? (
                        <span
                          className={`inline-block w-6 rounded ${AVAILABILITY_CLASSES[availability]}`}
                        >
                          {AVAILABILITY_SYMBOLS[availability]}
                        </span>
                      ) : (
                        <span className="text-slate-300">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {/* Editing happens on the participant page - only possible
                      while the doodle is still open. */}
                  {status === "open" && (
                    <a
                      href={`/d/${doodleId}?name=${encodeURIComponent(participant.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-3 text-sm text-indigo-600 hover:underline"
                    >
                      Bearbeiten
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(participant.name)}
                    disabled={busy}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
