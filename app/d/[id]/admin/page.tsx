"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Link as LinkIcon,
  LoaderCircle,
  Lock,
  Pencil,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
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
import {
  ConfirmDialog,
  Dialog,
  DialogFooter,
  DialogHeader,
  EmptyState,
  TabBar,
  panelId,
  tabId,
} from "../../../ui";

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

const AVAILABILITY_LABELS: Record<Availability, string> = {
  yes: "Ja",
  maybe: "Vielleicht",
  no: "Nein",
};

type AdminTab = "plan" | "stats" | "availability";

const TAB_LABELS: Record<AdminTab, string> = {
  plan: "Plan",
  stats: "Einsätze",
  availability: "Verfügbarkeiten",
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export default function AdminPage() {
  const { id } = useParams<{ id: string }>();
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [doodle, setDoodle] = useState<AdminDoodle | null>(null);
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The action currently in flight, so only its button shows a spinner.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("plan");
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{ plan: Plan } | null>(
    null
  );
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const busy = busyAction !== null;

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

  async function callAdmin(
    action: string,
    passwordOverride?: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    setError(null);
    setBusyAction(action);
    const usedPassword = passwordOverride ?? password;
    const response = await fetch(`/api/doodles/${id}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: usedPassword, action, ...extra }),
    });
    const result = await response.json();
    setBusyAction(null);
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
      <div className="mx-auto max-w-sm animate-rise-in sm:pt-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-600 shadow-card ring-1 ring-slate-200">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Admin-Bereich
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
          Gib das Passwort ein, das du beim Erstellen des Doodles festgelegt
          hast.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            callAdmin("login");
          }}
        >
          <div className="space-y-1.5">
            <label className="field-label" htmlFor="admin-password">
              Passwort
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !password}
            className="btn btn-primary btn-lg w-full"
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                Wird geprüft…
              </>
            ) : (
              "Anmelden"
            )}
          </button>
        </form>
      </div>
    );
  }

  if (!doodle)
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton h-8 w-1/3" />
        <div className="skeleton h-4 w-1/4" />
        <div className="skeleton mt-8 h-64 w-full" />
      </div>
    );

  // Everything the admin changed since the last save. Editing a slot back to
  // its stored value makes it disappear from this list again.
  const planChanges = collectPlanChanges(
    doodle.dates,
    doodle.plan,
    plan,
    doodle.config
  );
  const bandUrl =
    typeof window !== "undefined" ? `${window.location.origin}/d/${id}` : "";

  return (
    // Flex column instead of space-y: the fixed overlays below are out of
    // flow, so they get no gap - `space-y-*` would give them a top margin and
    // shift the whole backdrop down.
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {doodle.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
            {doodle.status === "open" ? (
              <span className="badge badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden />
                Offen
              </span>
            ) : (
              <span className="badge badge-neutral">
                <Lock className="h-3 w-3" aria-hidden />
                Geschlossen
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-slate-500" aria-hidden />
              {plural(participants.length, "Person", "Personen")}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
              {plural(doodle.dates.length, "Termin", "Termine")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton url={bandUrl} />
          {doodle.status === "open" ? (
            <button
              type="button"
              onClick={() => callAdmin("close")}
              disabled={busy}
              className="btn btn-primary"
            >
              {busyAction === "close" && (
                <LoaderCircle className="animate-spin" aria-hidden />
              )}
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
                className="btn btn-secondary"
              >
                {busyAction === "reopen" && (
                  <LoaderCircle className="animate-spin" aria-hidden />
                )}
                Wieder öffnen
              </button>
              {/* Amber, like the confirmation dialog: this overwrites the
                  whole plan and should not read as a harmless action. */}
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(true)}
                disabled={busy}
                className="btn btn-warning"
              >
                {busyAction === "regenerate" ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <RotateCcw aria-hidden />
                )}
                Plan neu generieren
              </button>
            </>
          )}
          {planChanges.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveConfirm(true)}
              disabled={busy}
              className="btn btn-success animate-pop-in"
            >
              {busyAction === "updatePlan" ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {planChanges.length === 1
                ? "1 Änderung speichern"
                : `${planChanges.length} Änderungen speichern`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {/* Without a plan there is only one thing to look at, so the tab bar
          would just be noise. */}
      {plan && (
        <TabBar
          tabs={[
            { id: "plan", label: TAB_LABELS.plan },
            { id: "stats", label: TAB_LABELS.stats },
            {
              id: "availability",
              label: TAB_LABELS.availability,
              count: participants.length,
            },
          ]}
          active={activeTab}
          idPrefix="admin"
          label="Ansicht"
          onSelect={setActiveTab}
        />
      )}

      {plan && activeTab === "plan" && (
        <div
          role="tabpanel"
          id={panelId("admin", "plan")}
          aria-labelledby={tabId("admin", "plan")}
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
        <div role="tabpanel" id={panelId("admin", "stats")} aria-labelledby={tabId("admin", "stats")}>
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
          id={panelId("admin", "availability")}
          aria-labelledby={tabId("admin", "availability")}
        >
          <AvailabilityMatrix
            title={doodle.title}
            doodleId={doodle.id}
            bandUrl={bandUrl}
            status={doodle.status}
            dates={doodle.dates}
            config={doodle.config}
            participants={participants}
            busy={busy}
            onDelete={setPendingDelete}
          />
        </div>
      )}

      {showRegenerateConfirm && (
        <ConfirmDialog
          title="Plan wirklich neu generieren?"
          description={
            <>
              <p>
                Der komplette Plan wird überschrieben und durch eine neue
                Zuteilung ersetzt. Bereits gespeicherte Änderungen gehen dabei
                verloren.
              </p>
              {planChanges.length > 0 && (
                <p className="mt-2 font-medium text-amber-800">
                  {planChanges.length === 1
                    ? "Du hast 1 ungespeicherte Änderung im Plan - auch diese geht verloren."
                    : `Du hast ${planChanges.length} ungespeicherte Änderungen im Plan - auch diese gehen verloren.`}
                </p>
              )}
            </>
          }
          confirmLabel="Plan überschreiben"
          tone="caution"
          onCancel={() => setShowRegenerateConfirm(false)}
          onConfirm={handleRegenerateConfirm}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title="Eintrag löschen?"
          description={
            <>
              Der Eintrag von «{pendingDelete}» wird gelöscht. Das kann nicht
              rückgängig gemacht werden.
            </>
          }
          confirmLabel="Eintrag löschen"
          tone="destructive"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const participantName = pendingDelete;
            setPendingDelete(null);
            callAdmin("deleteParticipant", undefined, { participantName });
          }}
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

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn btn-secondary"
    >
      {copied ? (
        <>
          <Check className="text-green-700" aria-hidden />
          Kopiert
        </>
      ) : (
        <>
          <LinkIcon aria-hidden />
          Band-Link kopieren
        </>
      )}
    </button>
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
    <Dialog labelledBy="save-confirm-title" size="md" onClose={onCancel}>
      <DialogHeader
        id="save-confirm-title"
        title={
          changes.length === 1
            ? "1 Änderung speichern?"
            : `${changes.length} Änderungen speichern?`
        }
        description="Diese Anpassungen werden in den Plan übernommen. Die Hinweise werden dabei neu berechnet."
      />
      <ul className="mx-6 mb-5 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {changes.map((change, index) => (
          <li
            key={`${change.date}-${change.slot}-${index}`}
            className="grid grid-cols-[5.5rem_1fr] gap-x-3 px-3 py-2.5 text-sm"
          >
            <span className="font-medium tabular-nums text-slate-900">
              {formatDateGerman(change.date).slice(0, -5)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">{change.slot}</span>
              <span className="block text-slate-800">{change.description}</span>
            </span>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Abbrechen
        </button>
        <button type="button" onClick={onConfirm} className="btn btn-success">
          Speichern
        </button>
      </DialogFooter>
    </Dialog>
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
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-toast w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2"
    >
      <div className="relative animate-rise-in overflow-hidden rounded-lg bg-slate-900 text-sm text-white shadow-dialog">
        <div className="flex items-center gap-3 py-2.5 pl-4 pr-2.5">
          <Check className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
          <span className="flex-1">Plan wurde neu generiert.</span>
          <button
            type="button"
            onClick={onUndo}
            className="btn btn-sm bg-white/10 text-white hover:bg-white/20 focus-visible:ring-offset-slate-900"
          >
            Rückgängig
            <span className="tabular-nums text-white/60">{secondsLeft}s</span>
          </button>
        </div>
        {/* Shows the remaining undo window at a glance. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-countdown bg-white/30"
        />
      </div>
    </div>
  );
}

function WarningsAccordion({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleWarnings = expanded ? warnings : warnings.slice(0, 5);
  const hiddenCount = warnings.length - visibleWarnings.length;
  return (
    <section className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60">
      <h2 className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-950">
        <TriangleAlert className="h-4 w-4 text-amber-700" aria-hidden />
        {plural(warnings.length, "Hinweis", "Hinweise")}
      </h2>
      <ul className="divide-y divide-amber-200/60 border-t border-amber-200/60">
        {visibleWarnings.map((warning) => {
          // Hints read "So., 15.11.2026: Bass fehlt".
          const separator = warning.indexOf(": ");
          const date = separator > 0 ? warning.slice(0, separator) : "";
          const message = separator > 0 ? warning.slice(separator + 2) : warning;
          return (
            <li
              key={warning}
              className="flex flex-col gap-x-4 px-4 py-2 text-sm sm:flex-row"
            >
              <span className="shrink-0 font-medium tabular-nums text-amber-950 sm:w-32">
                {date}
              </span>
              <span className="text-amber-900">{message}</span>
            </li>
          );
        })}
      </ul>
      {warnings.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-amber-200/60 px-4 py-2 text-left text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600/50"
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
        <p className="text-sm text-slate-600">
          Änderungen werden erst mit «Speichern» übernommen.
        </p>
        <button
          type="button"
          onClick={onDownloadPdf}
          className="btn btn-secondary btn-sm"
        >
          <Download aria-hidden />
          PDF herunterladen
        </button>
      </div>
      {/* Full-bleed: the plan table uses the entire viewport width so all
          role columns stay visible. */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6">
        <div className="card overflow-x-auto">
          <table
            className="w-full border-separate border-spacing-0 text-sm"
            // Enough room per column for a name with its status dot.
            style={{ minWidth: `${7 * 16 + columnCount * 156}px` }}
          >
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="sticky left-0 z-sticky w-28 border-b border-slate-200 bg-slate-50 px-4 py-2.5 font-medium">
                  Datum
                </th>
                {config.roles.map((role) => (
                  <th
                    key={role.id}
                    className="border-b border-slate-200 bg-slate-50 px-1.5 py-2.5 font-medium"
                  >
                    {role.label}
                  </th>
                ))}
                {showMd && (
                  <th className="border-b border-slate-200 bg-slate-50 px-1.5 py-2.5 pr-4 font-medium">
                    MD
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
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
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> verfügbar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> vielleicht
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> nicht verfügbar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-dashed border-slate-400" />{" "}
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
            // slot is configured as combinable with this one.
            excluded={slots
              .filter(
                (slot) => !(slot.role.id === role.id && slot.index === index)
              )
              .filter((slot) => !rolesCombinable(config, slot.role, role))
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
    <tr className="group align-top">
      <td className="sticky left-0 z-sticky whitespace-nowrap border-b border-slate-100 bg-white px-4 py-2.5 transition-colors group-last:border-b-0 group-hover:bg-slate-50">
        <span className="block text-xs text-slate-500">
          {dateObject.toLocaleDateString("de-CH", { weekday: "long" })}
        </span>
        <span className="font-medium tabular-nums text-slate-900">
          {dateObject.toLocaleDateString("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      </td>
      {config.roles.map((role) => (
        <td
          key={role.id}
          className="border-b border-slate-100 px-1.5 py-2 transition-colors group-last:border-b-0 group-hover:bg-slate-50"
        >
          {roleSelects(role)}
        </td>
      ))}
      {showMd && (
        <td className="border-b border-slate-100 px-1.5 py-2 pr-4 transition-colors group-last:border-b-0 group-hover:bg-slate-50">
          <StatusSelect
            label={`MD am ${formatDateGerman(date)}`}
            value={assignment.md ?? ""}
            status={null}
            accent
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
  const SortIcon = active
    ? sort.ascending
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.ascending ? "ascending" : "descending") : "none"
      }
      className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium first:pl-4 last:pr-4"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
          align === "center" ? "justify-center" : "justify-start"
        } ${active ? "text-slate-900" : ""}`}
      >
        {label}
        <SortIcon
          className={`h-3.5 w-3.5 ${active ? "text-indigo-600" : "text-slate-400"}`}
          aria-hidden
        />
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
    ...(config.combinations.length > 0 ? ["kombinierte Rollen"] : []),
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
      <p className="text-sm tabular-nums text-slate-600">
        <span className="font-medium text-slate-900">{totalAssignments}</span>{" "}
        Einsätze auf{" "}
        <span className="font-medium text-slate-900">{stats.length}</span>{" "}
        Personen · Median{" "}
        <span className="font-medium text-slate-900">
          {Number.isInteger(medianCount) ? medianCount : medianCount.toFixed(1)}
        </span>{" "}
        pro Person
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
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
          <tbody>
            {sortedStats.map((person) => (
              <tr key={person.name} className="group">
                <td className="whitespace-nowrap border-b border-slate-100 py-2 pl-4 pr-3 font-medium text-slate-900 transition-colors group-last:border-b-0 group-hover:bg-slate-50">
                  {person.name}
                  {person.isGuest && (
                    <span className="badge badge-neutral ml-1.5">Gast</span>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 transition-colors group-last:border-b-0 group-hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-5 text-right font-semibold tabular-nums ${
                        person.dateCount === 0
                          ? "text-slate-400"
                          : "text-slate-900"
                      }`}
                    >
                      {person.dateCount}
                    </span>
                    {/* Bar makes an unfair distribution visible at a glance. */}
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-indigo-500 transition-[width] duration-300 ease-out-quart"
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
        <p className="text-xs leading-relaxed text-slate-600">
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
    <td className="border-b border-slate-100 px-3 py-2 text-center tabular-nums transition-colors group-last:border-b-0 group-hover:bg-slate-50 last:pr-4">
      {count === 0 ? (
        <>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <span className="sr-only">0</span>
        </>
      ) : (
        <span className="font-medium text-slate-900">{count}</span>
      )}
    </td>
  );
}

// Quiet by default: an available person reads as a plain pill with a green
// dot, only "vielleicht" and "nicht verfügbar" tint the control, so the
// cells that need a second look stand out in a full plan.
const SELECT_STATUS_STYLES: Record<
  Availability,
  { dot: string; control: string }
> = {
  yes: {
    dot: "bg-green-500",
    control: "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
  },
  maybe: {
    dot: "bg-amber-500",
    control: "border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400",
  },
  no: {
    dot: "bg-red-500",
    control: "border-red-300 bg-red-50 text-red-950 hover:border-red-400",
  },
};

function StatusSelect({
  label,
  value,
  status,
  accent = false,
  children,
  onChange,
}: {
  label: string;
  value: string;
  status: Availability | null;
  // The MD column: a role tag rather than an availability.
  accent?: boolean;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  const assigned = value !== "";
  // status === null with a value means a free-text entry (guest) without
  // availability data - shown neutrally instead of red.
  const dotClass = !assigned
    ? "border border-dashed border-slate-400 bg-transparent"
    : accent
      ? "bg-indigo-500"
      : status === null
        ? "bg-slate-400"
        : SELECT_STATUS_STYLES[status].dot;
  const controlClass = !assigned
    ? "border-dashed border-slate-300 bg-transparent text-slate-500 hover:border-slate-400 hover:text-slate-700"
    : accent
      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950 hover:border-indigo-300"
      : status === null
        ? "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
        : SELECT_STATUS_STYLES[status].control;
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${dotClass}`}
      />
      <select
        aria-label={label}
        className={`h-8 w-full cursor-pointer appearance-none truncate rounded-md border pl-6 pr-6 text-[13px] font-medium shadow-xs transition-[border-color,background-color,color] duration-150 ease-out-quart focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${controlClass}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
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
      label={`${formatDateGerman(date)}: ${value ?? "offen"}`}
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
        // The selected name shows its status as the dot, so the symbol is
        // left out there and the name keeps the full width.
        return (
          <option key={participant.name} value={participant.name}>
            {participant.name === value
              ? participant.name
              : `${participant.name} ${AVAILABILITY_SYMBOLS[availability]}`}
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
        className="btn btn-secondary btn-sm"
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <Download aria-hidden />
        )}
        {busy ? "Datei wird erstellt…" : "Herunterladen"}
        <ChevronDown className="-mr-0.5 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-dropdown mt-1.5 w-44 origin-top-right animate-pop-in rounded-lg bg-white p-1 shadow-popover"
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
              className="flex w-full items-baseline justify-between rounded-md px-2.5 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
            >
              {option.label}
              <span className="text-xs text-slate-500">{option.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AvailabilityMark({ value }: { value: Availability | undefined }) {
  if (!value)
    return (
      <>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span className="sr-only">keine Antwort</span>
      </>
    );
  const styles: Record<Availability, string> = {
    yes: "bg-green-50 text-green-700 ring-green-600/20",
    maybe: "bg-amber-50 text-amber-800 ring-amber-600/25",
    no: "bg-red-50 text-red-700 ring-red-600/20",
  };
  return (
    <span
      className={`inline-grid h-6 w-6 place-items-center rounded-md text-xs font-semibold ring-1 ring-inset ${styles[value]}`}
      title={AVAILABILITY_LABELS[value]}
    >
      {value === "yes" ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      ) : value === "no" ? (
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      ) : (
        <span aria-hidden>?</span>
      )}
      <span className="sr-only">{AVAILABILITY_LABELS[value]}</span>
    </span>
  );
}

function AvailabilityMatrix({
  title,
  doodleId,
  bandUrl,
  status,
  dates,
  config,
  participants,
  busy,
  onDelete,
}: {
  title: string;
  doodleId: string;
  bandUrl: string;
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
      <div className="card">
        <EmptyState icon={<Users aria-hidden />} title="Noch niemand eingetragen">
          <p>Teile den Band-Link, damit sich alle eintragen können.</p>
          <div className="mt-4 flex justify-center">
            <CopyLinkButton url={bandUrl} />
          </div>
        </EmptyState>
      </div>
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
        <p className="text-sm text-slate-600">
          {plural(participants.length, "Person", "Personen")} ·{" "}
          {plural(dates.length, "Termin", "Termine")}
        </p>
        <DownloadMenu busy={exporting} onSelect={handleDownload} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="sticky left-0 z-sticky min-w-[13rem] border-b border-slate-200 bg-slate-50 py-2 pl-4 pr-3 font-medium">
                Person
              </th>
              {dates.map((date) => {
                const dateObject = new Date(date + "T00:00:00");
                return (
                  <th
                    key={date}
                    className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-1.5 py-2 text-center font-medium"
                  >
                    <span className="block text-[11px] text-slate-500">
                      {dateObject.toLocaleDateString("de-CH", { weekday: "short" })}
                    </span>
                    <span className="tabular-nums text-slate-700">
                      {dateObject.toLocaleDateString("de-CH", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </th>
                );
              })}
              <th className="border-b border-slate-200 bg-slate-50 py-2 pl-3 pr-4 text-right font-medium">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              <tr key={participant.name} className="group">
                <td className="sticky left-0 z-sticky border-b border-slate-100 bg-white py-2 pl-4 pr-3 transition-colors group-last:border-b-0 group-hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap font-medium text-slate-900">
                      {participant.name}
                    </span>
                    {participant.can_md && (
                      <span className="badge badge-indigo">MD</span>
                    )}
                    {participant.max_per_month != null && (
                      <span className="badge badge-neutral">
                        max. {participant.max_per_month}×/Mt.
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 max-w-[16rem] truncate text-xs text-slate-500">
                    {participant.roles
                      .map((role) => roleLabel(config, role))
                      .join(", ")}
                  </p>
                </td>
                {dates.map((date) => (
                  <td
                    key={date}
                    className="border-b border-slate-100 px-1.5 py-2 text-center transition-colors group-last:border-b-0 group-hover:bg-slate-50"
                  >
                    <AvailabilityMark value={participant.availability[date]} />
                  </td>
                ))}
                <td className="whitespace-nowrap border-b border-slate-100 py-2 pl-3 pr-3 text-right transition-colors group-last:border-b-0 group-hover:bg-slate-50">
                  {/* Editing happens on the participant page - only possible
                      while the doodle is still open. */}
                  {status === "open" && (
                    <a
                      href={`/d/${doodleId}?name=${encodeURIComponent(participant.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${participant.name} bearbeiten`}
                      title="Bearbeiten"
                      className="btn btn-ghost btn-icon"
                    >
                      <Pencil aria-hidden />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(participant.name)}
                    disabled={busy}
                    aria-label={`${participant.name} löschen`}
                    title="Löschen"
                    className="btn btn-ghost btn-icon hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 aria-hidden />
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
