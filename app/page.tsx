"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Lock,
  TriangleAlert,
} from "lucide-react";
import type { LineupConfig } from "@/lib/types";
import { DEFAULT_LINEUP } from "@/lib/roles";
import { DateAdder, DateList } from "./date-editor";
import { LineupEditorDialog, LineupSummary } from "./lineup-editor";
import { FormSection } from "./ui";

export default function CreateDoodlePage() {
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [config, setConfig] = useState<LineupConfig>(DEFAULT_LINEUP);
  const [editingLineup, setEditingLineup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function addDates(added: string[]) {
    setDates((current) => [...new Set([...current, ...added])].sort());
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
        <DateAdder onAdd={addDates} />
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
