"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  Availability,
  DateAssignment,
  Plan,
  Role,
} from "@/lib/types";
import { LINEUP_TARGETS, ROLE_LABELS, formatDateGerman } from "@/lib/roles";
import { downloadAvailabilityCsv } from "@/lib/csv";
import { downloadPlanPdf } from "@/lib/pdf";

interface AdminParticipant {
  name: string;
  roles: Role[];
  can_md: boolean;
  max_per_month: number | null;
  availability: Record<string, Availability>;
}

interface AdminDoodle {
  id: string;
  title: string;
  status: "open" | "closed";
  dates: string[];
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

export default function AdminPage() {
  const { id } = useParams<{ id: string }>();
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [doodle, setDoodle] = useState<AdminDoodle | null>(null);
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDirty, setPlanDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    plan: Plan;
    warnings: string[] | null;
  } | null>(null);
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
    if (!showRegenerateConfirm) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowRegenerateConfirm(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRegenerateConfirm]);

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
    setPlanDirty(false);
    return true;
  }

  async function handleRegenerateConfirm() {
    setShowRegenerateConfirm(false);
    const snapshot = doodle?.plan
      ? { plan: doodle.plan, warnings: doodle.warnings }
      : null;
    const success = await callAdmin("regenerate");
    if (success && snapshot) {
      setUndoSnapshot(snapshot);
      setUndoSecondsLeft(10);
    }
  }

  async function handleUndoRegenerate() {
    if (!undoSnapshot) return;
    const { plan: previousPlan, warnings: previousWarnings } = undoSnapshot;
    setUndoSnapshot(null);
    await callAdmin("updatePlan", undefined, {
      plan: previousPlan,
      warnings: previousWarnings,
    });
  }

  function updateAssignment(date: string, updated: DateAssignment) {
    if (!plan) return;
    setPlan({ ...plan, [date]: updated });
    setPlanDirty(true);
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

  return (
    <div className="space-y-10">
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
              Schliessen &amp; Plan erstellen
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
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(true)}
                disabled={busy}
                className="rounded border border-slate-300 bg-white px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
              >
                Plan neu generieren
              </button>
            </>
          )}
          {plan && (
            <>
              {planDirty && (
                <button
                  type="button"
                  onClick={() => callAdmin("updatePlan", undefined, { plan })}
                  disabled={busy}
                  className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Änderungen speichern
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadPlanPdf(doodle.title, plan)}
                className="rounded bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              >
                PDF herunterladen
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {doodle.warnings && doodle.warnings.length > 0 && (
        <WarningsAccordion warnings={doodle.warnings} />
      )}

      {plan && (
        <PlanEditor
          dates={doodle.dates}
          plan={plan}
          participants={participants}
          onChange={updateAssignment}
        />
      )}

      <AvailabilityMatrix
        title={doodle.title}
        doodleId={doodle.id}
        status={doodle.status}
        dates={doodle.dates}
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

      {showRegenerateConfirm && (
        <RegenerateConfirmDialog
          planDirty={planDirty}
          onCancel={() => setShowRegenerateConfirm(false)}
          onConfirm={handleRegenerateConfirm}
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

function RegenerateConfirmDialog({
  planDirty,
  onCancel,
  onConfirm,
}: {
  planDirty: boolean;
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
        {planDirty && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            Du hast ungespeicherte Änderungen im Plan - auch diese gehen
            verloren.
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
  plan,
  participants,
  onChange,
}: {
  dates: string[];
  plan: Plan;
  participants: AdminParticipant[];
  onChange: (date: string, updated: DateAssignment) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Plan</h2>
      {/* Full-bleed: the plan table uses the entire viewport width so all
          role columns stay visible. */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1250px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-3 font-semibold">Datum</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.leader}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.vocal}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.bass}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.egit}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.aguitar}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.drums}</th>
              <th className="px-3 py-3 font-semibold">{ROLE_LABELS.keys}</th>
              <th className="px-3 py-3 font-semibold">MD</th>
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
  assignment,
  participants,
  onChange,
}: {
  date: string;
  assignment: DateAssignment;
  participants: AdminParticipant[];
  onChange: (updated: DateAssignment) => void;
}) {
  const assigned = [
    assignment.leader,
    assignment.bass,
    assignment.drums,
    assignment.keys,
    ...assignment.vocals,
    ...assignment.egit,
  ].filter((name): name is string => name !== null);
  const aguitarName = assignment.aguitar ?? null;

  // Only people on an instrument slot can be MD (A-Guitar does not qualify).
  const instrumentNames = [
    assignment.bass,
    assignment.drums,
    assignment.keys,
    ...assignment.egit,
  ].filter((name): name is string => name !== null);
  const mdCandidates = participants.filter(
    (participant) =>
      instrumentNames.includes(participant.name) && participant.can_md
  );

  function singleSelect(role: "leader" | "bass" | "drums" | "keys") {
    // A-Guitar may double with a singing role, but never with another
    // instrument - so the acoustic guitarist is blocked for instrument slots.
    const aguitarBlocked =
      role === "bass" || role === "drums" || role === "keys"
        ? [aguitarName].filter((name): name is string => name !== null)
        : [];
    return (
      <PersonSelect
        date={date}
        role={role}
        value={assignment[role]}
        participants={participants}
        excluded={[
          ...assigned.filter((name) => name !== assignment[role]),
          ...aguitarBlocked,
        ]}
        onSelect={(name) => {
          const updated = { ...assignment, [role]: name };
          if (assignment[role] === assignment.md && name !== assignment[role])
            updated.md = null;
          onChange(updated);
        }}
      />
    );
  }

  function multiSelect(role: "vocal" | "egit", values: string[]) {
    const slotCount = Math.max(LINEUP_TARGETS[role].max, values.length);
    const aguitarBlocked =
      role === "egit"
        ? [aguitarName].filter((name): name is string => name !== null)
        : [];
    return (
      <div className="space-y-1">
        {Array.from({ length: slotCount }).map((_, index) => (
          <PersonSelect
            key={index}
            date={date}
            role={role}
            value={values[index] ?? null}
            participants={participants}
            excluded={[
              ...assigned.filter((name) => name !== values[index]),
              ...aguitarBlocked,
            ]}
            onSelect={(name) => {
              const updatedValues = [...values];
              if (name === null) updatedValues.splice(index, 1);
              else updatedValues[index] = name;
              const cleaned = updatedValues.filter(Boolean);
              const updated =
                role === "vocal"
                  ? { ...assignment, vocals: cleaned }
                  : { ...assignment, egit: cleaned };
              if (
                assignment.md !== null &&
                values[index] === assignment.md &&
                name !== assignment.md
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
      <td className="px-3 py-2">{singleSelect("leader")}</td>
      <td className="px-3 py-2">{multiSelect("vocal", assignment.vocals)}</td>
      <td className="px-3 py-2">{singleSelect("bass")}</td>
      <td className="px-3 py-2">{multiSelect("egit", assignment.egit)}</td>
      <td className="px-3 py-2">
        <PersonSelect
          date={date}
          role="aguitar"
          value={aguitarName}
          participants={participants}
          excluded={instrumentNames}
          onSelect={(name) => onChange({ ...assignment, aguitar: name })}
        />
      </td>
      <td className="px-3 py-2">{singleSelect("drums")}</td>
      <td className="px-3 py-2">{singleSelect("keys")}</td>
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
            ) && <option value={assignment.md}>{assignment.md} (Gast)</option>}
          {mdCandidates.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
          <option value={CUSTOM_NAME_OPTION}>✎ Anderer Name…</option>
        </StatusSelect>
      </td>
    </tr>
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
  role: Role;
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

function AvailabilityMatrix({
  title,
  doodleId,
  status,
  dates,
  participants,
  busy,
  onDelete,
}: {
  title: string;
  doodleId: string;
  status: "open" | "closed";
  dates: string[];
  participants: AdminParticipant[];
  busy: boolean;
  onDelete: (participantName: string) => void;
}) {
  if (participants.length === 0)
    return (
      <p className="text-slate-500">Noch hat sich niemand eingetragen.</p>
    );
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Verfügbarkeiten</h2>
        <button
          type="button"
          onClick={() => downloadAvailabilityCsv(title, dates, participants)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          CSV herunterladen
        </button>
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
                    .map((role) => ROLE_LABELS[role])
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
