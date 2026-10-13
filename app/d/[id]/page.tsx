"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CircleHelp,
  LoaderCircle,
  SearchX,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Availability, LineupConfig, RoleConfig, RoleId } from "@/lib/types";
import { findRole, formatDateGerman } from "@/lib/roles";
import {
  ConfirmDialog,
  EmptyState,
  FormSection,
  ToggleChip,
  handleRadioKeys,
} from "../../ui";

interface PublicDoodle {
  id: string;
  title: string;
  status: "open" | "closed";
  dates: string[];
  config: LineupConfig;
}

const AVAILABILITY_OPTIONS: Array<{
  value: Availability;
  label: string;
  icon: React.ReactNode;
  activeClass: string;
}> = [
  {
    value: "yes",
    label: "Ja",
    icon: <Check aria-hidden />,
    activeClass: "bg-green-50 text-green-800 ring-green-600/30",
  },
  {
    value: "maybe",
    label: "Vielleicht",
    icon: <CircleHelp aria-hidden />,
    activeClass: "bg-amber-50 text-amber-900 ring-amber-600/35",
  },
  {
    value: "no",
    label: "Nein",
    icon: <X aria-hidden />,
    activeClass: "bg-red-50 text-red-800 ring-red-600/30",
  },
];

const AVAILABILITY_VALUES = AVAILABILITY_OPTIONS.map((option) => option.value);

const MONTHLY_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
  { value: null, label: "So oft wie nötig" },
];

function groupByMonth(
  dates: string[]
): Array<{ key: string; label: string; dates: string[] }> {
  const groups: Array<{ key: string; label: string; dates: string[] }> = [];
  dates.forEach((date) => {
    const key = date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.dates.push(date);
      return;
    }
    groups.push({
      key,
      label: new Date(date + "T00:00:00").toLocaleDateString("de-CH", {
        month: "long",
        year: "numeric",
      }),
      dates: [date],
    });
  });
  return groups;
}

export default function ParticipantPage() {
  const { id } = useParams<{ id: string }>();
  const [doodle, setDoodle] = useState<PublicDoodle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [entryLoaded, setEntryLoaded] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  const [roles, setRoles] = useState<RoleId[]>([]);
  const [canMd, setCanMd] = useState(false);
  const [maxPerMonth, setMaxPerMonth] = useState<number | null>(null);
  const [availability, setAvailability] = useState<
    Record<string, Availability>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/doodles/${id}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (result.error) setLoadError(result.error);
        else setDoodle(result);
      })
      .catch(() => setLoadError("Doodle konnte nicht geladen werden"));
  }, [id]);

  // A confirmation only describes the state that was saved. Any later
  // change makes it stale.
  useEffect(() => {
    setSaved(false);
  }, [roles, canMd, maxPerMonth, availability]);

  const loadEntry = useCallback(
    async (rawName: string) => {
      const trimmedName = rawName.trim();
      if (!trimmedName) return;
      setCheckingName(true);
      const response = await fetch(
        `/api/doodles/${id}/participants?name=${encodeURIComponent(trimmedName)}`,
        { cache: "no-store" }
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
    },
    [id]
  );

  // Allow deep links like /d/<id>?name=Anna to open an entry directly
  // (used by the edit button in the admin area).
  useEffect(() => {
    const presetName = new URLSearchParams(window.location.search).get("name");
    if (presetName?.trim()) {
      setNameInput(presetName.trim());
      loadEntry(presetName);
    }
  }, [loadEntry]);

  // Back to the name step, e.g. after the entry was deleted.
  function leaveEntry() {
    setName(null);
    setNameInput("");
    setSaved(false);
    setError(null);
    setRenaming(false);
  }

  function startRename() {
    setRenameInput(name ?? "");
    setRenameError(null);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameError(null);
  }

  // Renames this entry instead of starting a new one. An entry that was
  // never saved only needs a name that nobody else uses yet.
  async function rename() {
    if (!name) return;
    const newName = renameInput.trim();
    if (!newName) {
      setRenameError("Bitte einen Namen eingeben");
      return;
    }
    if (newName === name) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    const response = entryLoaded
      ? await fetch(`/api/doodles/${id}/participants`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, newName }),
        })
      : await fetch(
          `/api/doodles/${id}/participants?name=${encodeURIComponent(newName)}`,
          { cache: "no-store" }
        );
    const result = await response.json();
    setRenameBusy(false);
    if (!response.ok) {
      setRenameError(result.error ?? "Unbekannter Fehler");
      return;
    }
    if (!entryLoaded && result.participant) {
      setRenameError(`«${result.participant.name}» hat sich schon eingetragen`);
      return;
    }
    setName(newName);
    setRenaming(false);
    // A deep link with the old name would open an empty entry on reload.
    const url = new URL(window.location.href);
    if (url.searchParams.has("name")) {
      url.searchParams.set("name", newName);
      window.history.replaceState(null, "", url);
    }
  }

  function hasMdRole(selectedRoles: RoleId[]): boolean {
    return selectedRoles.some(
      (role) => doodle !== null && findRole(doodle.config, role)?.canMd
    );
  }

  function toggleRole(role: RoleId) {
    const updatedRoles = roles.includes(role)
      ? roles.filter((existing) => existing !== role)
      : [...roles, role];
    setRoles(updatedRoles);
    if (!hasMdRole(updatedRoles)) setCanMd(false);
  }

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
        missingDates.length === 1
          ? "Bitte beantworte noch 1 Termin"
          : `Bitte beantworte noch ${missingDates.length} Termine`
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
    setEntryLoaded(true);
    setSaved(true);
  }

  async function deleteEntry() {
    if (!name) return;
    setConfirmingDelete(false);
    setError(null);
    setSaved(false);
    setDeleting(true);
    const response = await fetch(
      `/api/doodles/${id}/participants?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    const result = await response.json();
    setDeleting(false);
    if (!response.ok) {
      setError(result.error ?? "Unbekannter Fehler");
      return;
    }
    leaveEntry();
  }

  if (loadError)
    return (
      <EmptyState icon={<SearchX aria-hidden />} title="Doodle nicht gefunden">
        Prüfe, ob der Link vollständig ist, oder frag die Person, die dir den
        Link geschickt hat.
      </EmptyState>
    );

  if (!doodle)
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-busy="true">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton mt-8 h-16 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );

  if (doodle.status !== "open") {
    return (
      <EmptyState icon={<CalendarCheck aria-hidden />} title={doodle.title}>
        Dieses Doodle ist geschlossen, der Plan wurde bereits erstellt.
        Änderungen sind nur noch über die Person möglich, die plant.
      </EmptyState>
    );
  }

  if (name === null) {
    return (
      <div className="mx-auto max-w-sm animate-rise-in sm:pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">{doodle.title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
          Gib deinen Namen ein. Wenn du dich schon eingetragen hast, wird dein
          Eintrag geladen.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            loadEntry(nameInput);
          }}
        >
          <div className="space-y-1.5">
            <label className="field-label" htmlFor="name">
              Dein Name
            </label>
            <input
              id="name"
              className="input"
              placeholder="Vorname Nachname"
              autoComplete="name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!nameInput.trim() || checkingName}
            className="btn btn-primary btn-lg w-full"
          >
            {checkingName ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                Wird geprüft…
              </>
            ) : (
              <>
                Weiter
                <ArrowRight aria-hidden />
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  const answeredCount = doodle.dates.filter((date) => availability[date]).length;
  const roleGroups: Array<{ title: string; roles: RoleConfig[] }> = [
    { title: "Gesang", roles: doodle.config.roles.filter((role) => role.singing) },
    {
      title: "Instrumente",
      roles: doodle.config.roles.filter((role) => !role.singing),
    },
  ].filter((group) => group.roles.length > 0);

  return (
    <div className="mx-auto max-w-4xl animate-rise-in">
      <div className="border-b border-slate-200 pb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{doodle.title}</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Trage deine Rollen und deine Verfügbarkeit für das Semester ein.
        </p>
        {renaming ? (
          <form
            className="mt-5 flex max-w-lg flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              rename();
            }}
          >
            <input
              aria-label="Neuer Name"
              className="input min-w-[12rem] flex-1"
              value={renameInput}
              autoFocus
              onChange={(event) => setRenameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelRename();
              }}
            />
            <button
              type="submit"
              disabled={renameBusy}
              className="btn btn-primary h-11 sm:h-9"
            >
              {renameBusy && <LoaderCircle className="animate-spin" aria-hidden />}
              Übernehmen
            </button>
            <button
              type="button"
              onClick={cancelRename}
              className="btn btn-ghost h-11 sm:h-9"
            >
              Abbrechen
            </button>
            {renameError && (
              <p
                role="alert"
                className="flex w-full items-center gap-1.5 text-sm text-red-700"
              >
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {renameError}
              </p>
            )}
          </form>
        ) : (
          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <span>
              {entryLoaded ? "Eintrag von" : "Neuer Eintrag für"}{" "}
              <span className="font-medium text-slate-900">{name}</span>
            </span>
            <span className="text-slate-400" aria-hidden>
              ·
            </span>
            <button type="button" onClick={startRename} className="link">
              Name ändern
            </button>
          </p>
        )}
      </div>

      <FormSection
        title="Rollen"
        description="Was du in der Band machst. Mehrere sind möglich."
      >
        {roleGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-medium text-slate-500">
              {group.title}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.roles.map((role) => (
                <ToggleChip
                  key={role.id}
                  pressed={roles.includes(role.id)}
                  onClick={() => toggleRole(role.id)}
                >
                  {role.label}
                </ToggleChip>
              ))}
            </div>
          </div>
        ))}
        {hasMdRole(roles) && (
          <label className="flex animate-pop-in cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              className="checkbox mt-0.5"
              checked={canMd}
              onChange={(event) => setCanMd(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Ich kann MD übernehmen
              </span>
              <span className="block text-sm text-slate-600">
                Als Musical Director leitest du die Band musikalisch durch die
                Celebration.
              </span>
            </span>
          </label>
        )}
      </FormSection>

      <FormSection
        title="Einsätze pro Monat"
        description="Wie oft du höchstens eingeteilt werden möchtest. Der Wunsch wird berücksichtigt, wo es möglich ist."
      >
        <div
          role="radiogroup"
          aria-label="Höchstens pro Monat"
          className="inline-flex rounded-lg bg-slate-100 p-1"
          onKeyDown={(event) =>
            handleRadioKeys(
              event,
              MONTHLY_OPTIONS.map((option) => option.value),
              maxPerMonth,
              setMaxPerMonth
            )
          }
        >
          {MONTHLY_OPTIONS.map((option) => {
            const selected = maxPerMonth === option.value;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setMaxPerMonth(option.value)}
                className={`h-10 min-w-[3rem] rounded-md px-3.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 sm:h-9 ${
                  selected
                    ? "bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.08),0_0_0_1px_rgb(15_23_42/0.04)]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        title="Verfügbarkeit"
        description="Für jede Celebration eine Antwort. Wer «Ja» sagt, wird bevorzugt eingeplant."
      >
        <div className="flex gap-2 sm:justify-end">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAllAvailability("yes")}
          >
            Alle Ja
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAllAvailability("no")}
          >
            Alle Nein
          </button>
        </div>
        {groupByMonth(doodle.dates).map((month) => (
          <div key={month.key}>
            <p className="mb-2 text-xs font-medium text-slate-500">
              {month.label}
            </p>
            <ul className="card divide-y divide-slate-100">
              {month.dates.map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between gap-3 py-2 pl-4 pr-2"
                >
                  <span className="text-sm font-medium tabular-nums text-slate-900">
                    {formatDateGerman(date).slice(0, -5)}
                  </span>
                  <AvailabilityPicker
                    date={date}
                    value={availability[date]}
                    onChange={(value) =>
                      setAvailability({ ...availability, [date]: value })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </FormSection>

      {entryLoaded && (
        <div className="pt-6">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={submitting || deleting}
            className="btn btn-danger btn-sm -ml-2.5"
          >
            <Trash2 aria-hidden />
            {deleting ? "Wird gelöscht…" : "Eintrag löschen"}
          </button>
        </div>
      )}

      {/* Stays reachable while scrolling through a long semester. Full width
          on phones, a floating bar on larger screens. */}
      <div className="sticky bottom-0 z-bar -mx-4 mt-8 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:bottom-4 sm:mx-0 sm:rounded-xl sm:border sm:pb-3 sm:shadow-popover">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {error ? (
              <p className="flex items-center gap-1.5 text-red-700">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : saved ? (
              <p className="flex animate-pop-in items-center gap-1.5 text-green-800">
                <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                Gespeichert. Du kannst es jederzeit ändern.
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-slate-600">
                  <span className="font-medium text-slate-900">
                    {answeredCount}
                  </span>{" "}
                  von {doodle.dates.length} beantwortet
                </span>
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                  <span
                    className="block h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out-quart"
                    style={{
                      width: `${(answeredCount / Math.max(1, doodle.dates.length)) * 100}%`,
                    }}
                  />
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={submitting || deleting}
            className="btn btn-primary btn-lg sm:h-10"
          >
            {submitting ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                Speichert…
              </>
            ) : (
              "Speichern"
            )}
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Eintrag löschen?"
          description={
            <>
              Der Eintrag von «{name}» wird gelöscht. Das kann nicht rückgängig
              gemacht werden.
            </>
          }
          confirmLabel="Eintrag löschen"
          tone="destructive"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deleteEntry}
        />
      )}
    </div>
  );
}

function AvailabilityPicker({
  date,
  value,
  onChange,
}: {
  date: string;
  value: Availability | undefined;
  onChange: (value: Availability) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Verfügbarkeit am ${formatDateGerman(date)}`}
      className="grid w-[13.5rem] shrink-0 grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:w-[19rem]"
      onKeyDown={(event) =>
        handleRadioKeys(event, AVAILABILITY_VALUES, value, onChange)
      }
    >
      {AVAILABILITY_OPTIONS.map((option, index) => {
        const selected = value === option.value;
        // Without an answer yet, the first option is the tab stop.
        const tabStop = selected || (value === undefined && index === 0);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabStop ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 sm:h-9 sm:text-sm [&_svg]:hidden [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:block ${
              selected
                ? `${option.activeClass} shadow-xs ring-1 ring-inset`
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
