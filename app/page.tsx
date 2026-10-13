"use client";

import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Lock,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LineupConfig } from "@/lib/types";
import { DEFAULT_LINEUP, formatDateGerman } from "@/lib/roles";
import { LineupEditorDialog, LineupSummary } from "./lineup-editor";
import { FormSection } from "./ui";

// Index matches JavaScript's Date.getDay() (0 = Sonntag).
const WEEKDAYS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function groupByMonth(
  dates: string[]
): Array<{ key: string; label: string; dates: string[] }> {
  const groups: Array<{ key: string; label: string; dates: string[] }> = [];
  [...dates].sort().forEach((date) => {
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

export default function CreateDoodlePage() {
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [weekday, setWeekday] = useState(0); // 0 = Sonntag (JS getDay)
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [config, setConfig] = useState<LineupConfig>(DEFAULT_LINEUP);
  const [editingLineup, setEditingLineup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function addDate() {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput("");
  }

  function addWeeklyDates() {
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    const daysUntilWeekday = (weekday - start.getDay() + 7) % 7;
    const first = new Date(start);
    first.setDate(start.getDate() + daysUntilWeekday);
    const weekCount =
      Math.floor((end.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const generated = Array.from({ length: Math.max(0, weekCount) }, (_, week) => {
      const date = new Date(first);
      date.setDate(first.getDate() + week * 7);
      return toIsoDate(date);
    });
    setDates([...new Set([...dates, ...generated])].sort());
  }

  async function createDoodle() {
    setError(null);
    setSubmitting(true);
    const response = await fetch("/api/doodles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dates, password, config }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(result.error ?? "Unbekannter Fehler");
      return;
    }
    setCreatedId(result.id);
  }

  if (createdId) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <div className="mx-auto max-w-lg animate-rise-in">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Doodle erstellt
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
          Teile den Band-Link, damit sich alle eintragen. Über den Admin-Link
          schliesst du das Doodle und erstellst den Plan.
        </p>
        <div className="mt-8 space-y-3">
          <LinkBox
            label="Band-Link"
            description="Zum Teilen mit der ganzen Band"
            url={`${baseUrl}/d/${createdId}`}
          />
          <LinkBox
            label="Admin-Link"
            description="Nur für dich, mit Passwort geschützt"
            url={`${baseUrl}/d/${createdId}/admin`}
          />
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm text-slate-600">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          Merke dir dein Passwort. Ohne es kommst du nicht auf die Admin-Seite.
        </p>
      </div>
    );
  }

  const weeklyRangeValid = Boolean(rangeStart && rangeEnd && rangeEnd >= rangeStart);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="border-b border-slate-200 pb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Neues Doodle erstellen
        </h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Lege die Celebrations des Semesters fest und teile den Link mit der
          Band. Sobald alle eingetragen sind, entsteht daraus ein fairer Plan.
        </p>
      </div>

      <FormSection
        title="Allgemein"
        description="Den Titel sieht die ganze Band. Mit dem Passwort öffnest du später die Admin-Seite."
      >
        <div className="space-y-1.5">
          <label className="field-label" htmlFor="title">
            Titel
          </label>
          <input
            id="title"
            className="input"
            placeholder="z.B. Worship-Plan Herbstsemester 2026"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="field-label" htmlFor="password">
            Admin-Passwort
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="Mindestens 4 Zeichen"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </FormSection>

      <FormSection
        title="Termine"
        description="Alle Celebrations des Semesters, wöchentlich für einen Zeitraum oder einzeln."
      >
        <div className="card divide-y divide-slate-100">
          <div className="space-y-3 p-4">
            <p className="text-sm font-medium text-slate-900">Wöchentlich</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="col-span-2 block space-y-1.5 sm:col-span-1">
                <span className="text-xs font-medium text-slate-600">
                  Wochentag
                </span>
                <select
                  className="select"
                  value={weekday}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                >
                  {WEEKDAYS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Von</span>
                <input
                  type="date"
                  className="input"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Bis</span>
                <input
                  type="date"
                  className="input"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={addWeeklyDates}
                disabled={!weeklyRangeValid}
                className="btn btn-secondary col-span-2 h-11 sm:col-span-3 sm:h-9 sm:justify-self-start"
              >
                <Plus aria-hidden />
                Wöchentliche Termine hinzufügen
              </button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-sm font-medium text-slate-900">Einzelnes Datum</p>
            <div className="flex gap-3">
              <input
                type="date"
                aria-label="Datum"
                className="input flex-1 sm:w-48 sm:flex-none"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
              />
              <button
                type="button"
                onClick={addDate}
                disabled={!dateInput}
                className="btn btn-secondary h-11 sm:h-9"
              >
                <Plus aria-hidden />
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
        <DateList
          dates={dates}
          onRemove={(date) =>
            setDates(dates.filter((existing) => existing !== date))
          }
        />
      </FormSection>

      <FormSection
        title="Besetzung"
        description="Welche Rollen es gibt und wie viele Personen pro Celebration eingeteilt werden."
      >
        <LineupSummary
          config={config}
          onEdit={() => setEditingLineup(true)}
          onReset={() => setConfig(DEFAULT_LINEUP)}
        />
      </FormSection>

      <div className="flex flex-col-reverse gap-3 pt-8 sm:flex-row sm:items-center sm:justify-end">
        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-sm text-red-700 sm:mr-auto"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={createDoodle}
          disabled={submitting}
          className="btn btn-primary btn-lg w-full sm:w-auto"
        >
          {submitting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Wird erstellt…
            </>
          ) : (
            <>
              Doodle erstellen
              <ArrowRight aria-hidden />
            </>
          )}
        </button>
      </div>

      {editingLineup && (
        <LineupEditorDialog
          initial={config}
          onCancel={() => setEditingLineup(false)}
          onApply={(updated) => {
            setConfig(updated);
            setEditingLineup(false);
          }}
        />
      )}
    </div>
  );
}

function DateList({
  dates,
  onRemove,
}: {
  dates: string[];
  onRemove: (date: string) => void;
}) {
  if (dates.length === 0)
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 px-4 py-7 text-center">
        <CalendarDays className="h-5 w-5 text-slate-500" aria-hidden />
        <p className="mt-2 text-sm font-medium text-slate-800">
          Noch keine Termine
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          Füge oben einen Zeitraum oder ein einzelnes Datum hinzu.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <span className="font-medium tabular-nums text-slate-900">
          {dates.length}
        </span>{" "}
        {dates.length === 1 ? "Termin" : "Termine"}
      </p>
      {groupByMonth(dates).map((month) => (
        <div key={month.key} className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{month.label}</p>
          <ul className="flex flex-wrap gap-2">
            {month.dates.map((date) => (
              <li
                key={date}
                className="inline-flex h-8 animate-pop-in items-center gap-0.5 rounded-md border border-slate-200 bg-white pl-2.5 pr-0.5 text-sm tabular-nums text-slate-800 shadow-xs"
              >
                {formatDateGerman(date).slice(0, -5)}
                <button
                  type="button"
                  onClick={() => onRemove(date)}
                  aria-label={`${formatDateGerman(date)} entfernen`}
                  className="grid h-7 w-7 place-items-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LinkBox({
  label,
  description,
  url,
}: {
  label: string;
  description: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm -mr-1 -mt-1"
        >
          Öffnen
          <ExternalLink aria-hidden />
        </a>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          aria-label={label}
          onFocus={(event) => event.target.select()}
          className="input input-compact font-mono text-[13px] text-slate-700"
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="btn btn-secondary w-28"
        >
          {copied ? (
            <>
              <Check className="text-green-700" aria-hidden />
              Kopiert
            </>
          ) : (
            <>
              <Copy aria-hidden />
              Kopieren
            </>
          )}
        </button>
      </div>
    </div>
  );
}
