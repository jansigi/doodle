"use client";

import { useState } from "react";
import { CalendarDays, Plus, Undo2, X } from "lucide-react";
import { formatDateGerman } from "@/lib/roles";
import { groupByMonth, weeklyDates } from "@/lib/dates";

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

// Adds celebrations weekly for a period or one by one. The caller merges
// them into its list, duplicates included.
export function DateAdder({ onAdd }: { onAdd: (dates: string[]) => void }) {
  const [dateInput, setDateInput] = useState("");
  const [weekday, setWeekday] = useState(0); // 0 = Sonntag (JS getDay)
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const weeklyRangeValid = Boolean(
    rangeStart && rangeEnd && rangeEnd >= rangeStart
  );

  return (
    <div className="card divide-y divide-slate-100">
      <div className="space-y-3 p-4">
        <p className="text-sm font-medium text-slate-900">Wöchentlich</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 block space-y-1.5 sm:col-span-1">
            <span className="text-xs font-medium text-slate-600">Wochentag</span>
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
            onClick={() => onAdd(weeklyDates(weekday, rangeStart, rangeEnd))}
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
            onClick={() => {
              onAdd([dateInput]);
              setDateInput("");
            }}
            disabled={!dateInput}
            className="btn btn-secondary h-11 sm:h-9"
          >
            <Plus aria-hidden />
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

type DateState = "kept" | "added" | "removed";

// The chosen dates as chips, grouped by month. With `savedDates` (editing an
// existing doodle) new dates are marked and removed ones stay visible, struck
// through and restorable, until the change is saved.
export function DateList({
  dates,
  savedDates,
  onRemove,
  onRestore,
}: {
  dates: string[];
  savedDates?: string[];
  onRemove: (date: string) => void;
  onRestore?: (date: string) => void;
}) {
  const shown = savedDates ? [...new Set([...dates, ...savedDates])] : dates;
  function stateOf(date: string): DateState {
    if (!savedDates) return "kept";
    if (!dates.includes(date)) return "removed";
    return savedDates.includes(date) ? "kept" : "added";
  }

  if (shown.length === 0)
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
      {groupByMonth(shown).map((month) => (
        <div key={month.key} className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{month.label}</p>
          <ul className="flex flex-wrap gap-2">
            {month.dates.map((date) => (
              <DateChip
                key={date}
                date={date}
                state={stateOf(date)}
                onRemove={() => onRemove(date)}
                onRestore={() => onRestore?.(date)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const CHIP_STYLES: Record<DateState, { chip: string; button: string }> = {
  kept: {
    chip: "border-slate-200 bg-white text-slate-800 shadow-xs",
    button: "hover:bg-slate-100",
  },
  added: {
    chip: "border-indigo-200 bg-indigo-50 text-indigo-950 shadow-xs",
    button: "hover:bg-indigo-100",
  },
  removed: {
    chip: "border-dashed border-slate-300 bg-transparent text-slate-500",
    button: "hover:bg-slate-100",
  },
};

function DateChip({
  date,
  state,
  onRemove,
  onRestore,
}: {
  date: string;
  state: DateState;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const styles = CHIP_STYLES[state];
  const removed = state === "removed";
  return (
    <li
      className={`inline-flex h-8 animate-pop-in items-center gap-0.5 rounded-md border pr-0.5 text-sm tabular-nums ${
        state === "added" ? "pl-2" : "pl-2.5"
      } ${styles.chip}`}
    >
      {/* The icon and the strike-through repeat what the color says. */}
      {state === "added" && (
        <Plus className="mr-0.5 h-3 w-3 text-indigo-600" strokeWidth={2.5} aria-hidden />
      )}
      <span className={removed ? "line-through decoration-slate-400" : ""}>
        {formatDateGerman(date).slice(0, -5)}
      </span>
      {state === "added" && <span className="sr-only">(neu)</span>}
      {removed && <span className="sr-only">(wird entfernt)</span>}
      <button
        type="button"
        onClick={removed ? onRestore : onRemove}
        aria-label={`${formatDateGerman(date)} ${removed ? "wiederherstellen" : "entfernen"}`}
        title={removed ? "Wiederherstellen" : "Entfernen"}
        className={`grid h-7 w-7 place-items-center rounded text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${styles.button}`}
      >
        {removed ? (
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <X className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </li>
  );
}
