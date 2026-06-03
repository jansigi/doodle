"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Availability, Role } from "@/lib/types";
import {
  ALL_ROLES,
  INSTRUMENT_ROLES,
  ROLE_LABELS,
  formatDateGerman,
} from "@/lib/roles";

interface PublicDoodle {
  id: string;
  title: string;
  status: "open" | "closed";
  dates: string[];
}

const AVAILABILITY_OPTIONS: Array<{
  value: Availability;
  label: string;
  activeClass: string;
}> = [
  { value: "yes", label: "Ja", activeClass: "bg-green-600 text-white" },
  { value: "maybe", label: "Vielleicht", activeClass: "bg-amber-500 text-white" },
  { value: "no", label: "Nein", activeClass: "bg-red-600 text-white" },
];

export default function ParticipantPage() {
  const { id } = useParams<{ id: string }>();
  const [doodle, setDoodle] = useState<PublicDoodle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [entryLoaded, setEntryLoaded] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  const [canMd, setCanMd] = useState(false);
  const [maxPerMonth, setMaxPerMonth] = useState<number | null>(null);
  const [availability, setAvailability] = useState<
    Record<string, Availability>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/doodles/${id}`)
      .then((response) => response.json())
      .then((result) => {
        if (result.error) setLoadError(result.error);
        else setDoodle(result);
      })
      .catch(() => setLoadError("Doodle konnte nicht geladen werden"));
  }, [id]);

  async function confirmName() {
    const trimmedName = nameInput.trim();
    if (!trimmedName) return;
    setCheckingName(true);
    const response = await fetch(
      `/api/doodles/${id}/participants?name=${encodeURIComponent(trimmedName)}`
    );
    const result = await response.json();
    setCheckingName(false);
    if (result.participant) {
      setName(result.participant.name);
      setRoles(result.participant.roles);
      setCanMd(result.participant.can_md);
      setMaxPerMonth(result.participant.max_per_month ?? null);
      setAvailability(result.participant.availability);
      setEntryLoaded(true);
    } else {
      setName(trimmedName);
      setRoles([]);
      setCanMd(false);
      setMaxPerMonth(null);
      setAvailability({});
      setEntryLoaded(false);
    }
  }

  function changeName() {
    setName(null);
    setNameInput("");
    setSaved(false);
    setError(null);
  }

  function toggleRole(role: Role) {
    const updatedRoles = roles.includes(role)
      ? roles.filter((existing) => existing !== role)
      : [...roles, role];
    setRoles(updatedRoles);
    if (
      !updatedRoles.some((selected) => INSTRUMENT_ROLES.includes(selected))
    )
      setCanMd(false);
  }

  const playsInstrument = roles.some((selected) =>
    INSTRUMENT_ROLES.includes(selected)
  );

  function setAllAvailability(value: Availability) {
    if (!doodle) return;
    setAvailability(
      Object.fromEntries(doodle.dates.map((date) => [date, value]))
    );
  }

  async function save() {
    setError(null);
    setSaved(false);
    if (!doodle || !name) return;
    const missingDates = doodle.dates.filter((date) => !availability[date]);
    if (missingDates.length > 0) {
      setError(
        `Bitte für alle Daten eine Antwort wählen (${missingDates.length} fehlen)`
      );
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/doodles/${id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, roles, canMd, maxPerMonth, availability }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(result.error ?? "Unbekannter Fehler");
      return;
    }
    setSaved(true);
  }

  if (loadError) return <p className="text-red-600">{loadError}</p>;
  if (!doodle) return <p className="text-slate-500">Lädt…</p>;

  if (doodle.status !== "open") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">{doodle.title}</h1>
        <p className="rounded bg-amber-100 p-4 text-amber-900">
          Dieses Doodle ist geschlossen. Der Plan wurde bereits erstellt.
        </p>
      </div>
    );
  }

  if (name === null) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{doodle.title}</h1>
          <p className="text-slate-500">
            Gib deinen Namen ein. Wenn du dich schon eingetragen hast, wird
            dein Eintrag geladen.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block font-medium" htmlFor="name">
            Dein Name
          </label>
          <input
            id="name"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Vorname Nachname"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && confirmName()}
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={confirmName}
          disabled={!nameInput.trim() || checkingName}
          className="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {checkingName ? "Wird geprüft…" : "Weiter"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{doodle.title}</h1>
        <p className="text-slate-500">
          Trage deine Rollen und deine Verfügbarkeit für das Semester ein.
        </p>
      </div>

      <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-slate-500">
            {entryLoaded
              ? "Bestehender Eintrag geladen"
              : "Neuer Eintrag"}
          </p>
        </div>
        <button
          type="button"
          onClick={changeName}
          className="text-sm text-indigo-600 hover:underline"
        >
          Name ändern
        </button>
      </div>

      <section className="space-y-2">
        <p className="font-medium">Deine Rollen (mehrere möglich)</p>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                roles.includes(role)
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 bg-white hover:border-indigo-400"
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
        {playsInstrument && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canMd}
              onChange={(event) => setCanMd(event.target.checked)}
            />
            Ich kann MD (Musical Director) übernehmen
          </label>
        )}
      </section>

      <section className="space-y-2">
        <p className="font-medium">
          Wie oft pro Monat möchtest du höchstens eingeteilt werden?
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setMaxPerMonth(count)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                maxPerMonth === count
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 bg-white hover:border-indigo-400"
              }`}
            >
              {count}×
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMaxPerMonth(null)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              maxPerMonth === null
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white hover:border-indigo-400"
            }`}
          >
            So oft wie nötig
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Dein Wunsch wird bei der Planung berücksichtigt, wo es möglich ist.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-medium">Deine Verfügbarkeit</p>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => setAllAvailability("yes")}
            >
              Alle Ja
            </button>
            <button
              type="button"
              className="text-indigo-600 hover:underline"
              onClick={() => setAllAvailability("no")}
            >
              Alle Nein
            </button>
          </div>
        </div>
        <ul className="divide-y rounded border border-slate-200 bg-white">
          {doodle.dates.map((date) => (
            <li
              key={date}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span>{formatDateGerman(date)}</span>
              <div className="flex gap-1">
                {AVAILABILITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setAvailability({ ...availability, [date]: option.value })
                    }
                    className={`rounded px-3 py-1 text-sm transition ${
                      availability[date] === option.value
                        ? option.activeClass
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-red-600">{error}</p>}
      {saved && (
        <p className="rounded bg-green-100 p-3 text-green-800">
          Gespeichert! Du kannst deine Angaben jederzeit über deinen Namen
          wieder laden und anpassen.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={submitting}
        className="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Wird gespeichert…" : "Speichern"}
      </button>
    </div>
  );
}
