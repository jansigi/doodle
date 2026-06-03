"use client";

import { useState } from "react";
import { formatDateGerman } from "@/lib/roles";

export default function CreateDoodlePage() {
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function addDate() {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput("");
  }

  async function createDoodle() {
    setError(null);
    setSubmitting(true);
    const response = await fetch("/api/doodles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dates, password }),
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
    const publicUrl = `${baseUrl}/d/${createdId}`;
    const adminUrl = `${baseUrl}/d/${createdId}/admin`;
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">Doodle erstellt 🎉</h1>
        <LinkBox label="Link für die Band (zum Teilen)" url={publicUrl} />
        <LinkBox label="Admin-Link (für dich, Passwort nötig)" url={adminUrl} />
        <p className="text-sm text-slate-500">
          Merke dir dein Passwort – du brauchst es für die Admin-Seite.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Neues Worship-Doodle erstellen</h1>

      <div className="space-y-2">
        <label className="block font-medium" htmlFor="title">
          Titel
        </label>
        <input
          id="title"
          className="w-full rounded border border-slate-300 px-3 py-2"
          placeholder="z.B. Worship-Plan Herbstsemester 2026"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="block font-medium" htmlFor="password">
          Admin-Passwort
        </label>
        <input
          id="password"
          type="password"
          className="w-full rounded border border-slate-300 px-3 py-2"
          placeholder="Mindestens 4 Zeichen"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="block font-medium" htmlFor="date">
          Daten der Celebrations
        </label>
        <div className="flex gap-2">
          <input
            id="date"
            type="date"
            className="rounded border border-slate-300 px-3 py-2"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
          />
          <button
            type="button"
            onClick={addDate}
            className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
          >
            Hinzufügen
          </button>
        </div>
        <ul className="divide-y rounded border border-slate-200 bg-white">
          {dates.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">
              Noch keine Daten hinzugefügt
            </li>
          )}
          {dates.map((date) => (
            <li
              key={date}
              className="flex items-center justify-between px-3 py-2"
            >
              <span>{formatDateGerman(date)}</span>
              <button
                type="button"
                onClick={() =>
                  setDates(dates.filter((existing) => existing !== date))
                }
                className="text-sm text-red-600 hover:underline"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <button
        type="button"
        onClick={createDoodle}
        disabled={submitting}
        className="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Wird erstellt…" : "Doodle erstellen"}
      </button>
    </div>
  );
}

function LinkBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="mb-2 font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-slate-100 px-2 py-1 text-sm">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className="rounded bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700"
        >
          {copied ? "Kopiert ✓" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}
