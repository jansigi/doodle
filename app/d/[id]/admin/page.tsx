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
import { downloadPlanPdf } from "@/lib/pdf";

interface AdminParticipant {
  name: string;
  roles: Role[];
  can_md: boolean;
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

  useEffect(() => {
    const storedPassword = sessionStorage.getItem(`doodle-admin-${id}`);
    if (storedPassword) {
      setPassword(storedPassword);
      callAdmin("login", storedPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function callAdmin(
    action: string,
    passwordOverride?: string,
    extra?: Record<string, unknown>
  ) {
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
      return;
    }
    sessionStorage.setItem(`doodle-admin-${id}`, usedPassword);
    setLoggedIn(true);
    setDoodle(result.doodle);
    setParticipants(result.participants);
    setPlan(result.doodle.plan);
    setPlanDirty(false);
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
                onClick={() => callAdmin("regenerate")}
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
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">
            Hinweise ({doodle.warnings.length})
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-900">
            {doodle.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {plan && (
        <PlanEditor
          dates={doodle.dates}
          plan={plan}
          participants={participants}
          onChange={updateAssignment}
        />
      )}

      <AvailabilityMatrix dates={doodle.dates} participants={participants} />
    </div>
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
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">{ROLE_LABELS.leader}</th>
              <th className="px-3 py-2">{ROLE_LABELS.coordinator}</th>
              <th className="px-3 py-2">{ROLE_LABELS.vocal}</th>
              <th className="px-3 py-2">{ROLE_LABELS.bass}</th>
              <th className="px-3 py-2">{ROLE_LABELS.egit}</th>
              <th className="px-3 py-2">{ROLE_LABELS.drums}</th>
              <th className="px-3 py-2">{ROLE_LABELS.keys}</th>
              <th className="px-3 py-2">MD</th>
            </tr>
          </thead>
          <tbody className="divide-y">
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
      <p className="text-xs text-slate-500">
        ✓ verfügbar · ? vielleicht · ✗ nicht verfügbar
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
    assignment.coordinator,
    assignment.bass,
    assignment.drums,
    assignment.keys,
    ...assignment.vocals,
    ...assignment.egit,
  ].filter((name): name is string => name !== null);

  const mdCandidates = participants.filter(
    (participant) => assigned.includes(participant.name) && participant.can_md
  );

  function singleSelect(role: "leader" | "coordinator" | "bass" | "drums" | "keys") {
    return (
      <PersonSelect
        date={date}
        role={role}
        value={assignment[role]}
        participants={participants}
        excluded={assigned.filter((name) => name !== assignment[role])}
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
    return (
      <div className="space-y-1">
        {Array.from({ length: slotCount }).map((_, index) => (
          <PersonSelect
            key={index}
            date={date}
            role={role}
            value={values[index] ?? null}
            participants={participants}
            excluded={assigned.filter((name) => name !== values[index])}
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

  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-2 font-medium">
        {formatDateGerman(date)}
      </td>
      <td className="px-3 py-2">{singleSelect("leader")}</td>
      <td className="px-3 py-2">{singleSelect("coordinator")}</td>
      <td className="px-3 py-2">{multiSelect("vocal", assignment.vocals)}</td>
      <td className="px-3 py-2">{singleSelect("bass")}</td>
      <td className="px-3 py-2">{multiSelect("egit", assignment.egit)}</td>
      <td className="px-3 py-2">{singleSelect("drums")}</td>
      <td className="px-3 py-2">{singleSelect("keys")}</td>
      <td className="px-3 py-2">
        <select
          className="w-full rounded border border-slate-300 px-2 py-1"
          value={assignment.md ?? ""}
          onChange={(event) =>
            onChange({ ...assignment, md: event.target.value || null })
          }
        >
          <option value="">—</option>
          {mdCandidates.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
        </select>
      </td>
    </tr>
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
  const currentAvailability =
    value !== null
      ? participants.find((participant) => participant.name === value)
          ?.availability[date]
      : undefined;

  return (
    <div className="flex items-center gap-1">
      <select
        className="w-full rounded border border-slate-300 px-2 py-1"
        value={value ?? ""}
        onChange={(event) => onSelect(event.target.value || null)}
      >
        <option value="">—</option>
        {options.map((participant) => {
          const availability = participant.availability[date] ?? "no";
          return (
            <option key={participant.name} value={participant.name}>
              {participant.name} {AVAILABILITY_SYMBOLS[availability]}
            </option>
          );
        })}
      </select>
      {value !== null && (
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            AVAILABILITY_CLASSES[currentAvailability ?? "no"]
          }`}
        >
          {AVAILABILITY_SYMBOLS[currentAvailability ?? "no"]}
        </span>
      )}
    </div>
  );
}

function AvailabilityMatrix({
  dates,
  participants,
}: {
  dates: string[];
  participants: AdminParticipant[];
}) {
  if (participants.length === 0)
    return (
      <p className="text-slate-500">Noch hat sich niemand eingetragen.</p>
    );
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Verfügbarkeiten</h2>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
