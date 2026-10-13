"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";

const DIALOG_WIDTHS = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// One modal shell for every dialog: backdrop, entrance motion, Escape,
// focus kept inside while open and handed back to the trigger afterwards.
export function Dialog({
  labelledBy,
  size = "sm",
  alert = false,
  onClose,
  children,
}: {
  labelledBy: string;
  size?: keyof typeof DIALOG_WIDTHS;
  // Confirmations of destructive actions are announced as alert dialogs.
  alert?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Autofocus inside the dialog wins, otherwise the panel itself.
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-modal flex items-end justify-center bg-slate-900/30 p-3 animate-fade-in sm:items-center sm:p-6"
      // Mouse down instead of click: dragging a text selection out of the
      // panel must not close it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${DIALOG_WIDTHS[size]} flex-col overflow-hidden rounded-xl bg-white shadow-dialog animate-dialog-in focus:outline-none sm:max-h-[calc(100dvh-3rem)]`}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  id,
  title,
  description,
  onClose,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start gap-4 px-6 pb-4 pt-5">
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {description && (
          <div className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {description}
          </div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Schliessen"
          className="btn btn-ghost btn-icon -mr-2 -mt-1"
        >
          <X />
        </button>
      )}
    </div>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
      {children}
    </div>
  );
}

// Replaces window.confirm, so destructive questions look like the rest of
// the app and name the consequence on the button itself.
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone: "destructive" | "caution";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog labelledBy="confirm-dialog-title" alert onClose={onCancel}>
      <DialogHeader
        id="confirm-dialog-title"
        title={title}
        description={description}
      />
      <DialogFooter>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`btn ${tone === "destructive" ? "btn-destructive" : "btn-caution"}`}
        >
          {confirmLabel}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center animate-rise-in">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-600 shadow-card ring-1 ring-slate-200 [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      {children && (
        <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">
          {children}
        </div>
      )}
    </div>
  );
}

// Arrow keys move the selection inside a radio group, as with native
// radio buttons. Only the selected option is a tab stop.
export function handleRadioKeys<T>(
  event: React.KeyboardEvent<HTMLElement>,
  options: T[],
  current: T | undefined,
  onSelect: (value: T) => void
) {
  const offset =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (offset === 0) return;
  event.preventDefault();
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  ];
  // Move from the focused option, which is the first one while nothing is
  // selected yet.
  const focusedIndex = buttons.indexOf(document.activeElement as HTMLElement);
  const index =
    focusedIndex >= 0
      ? focusedIndex
      : current === undefined
        ? 0
        : options.indexOf(current);
  const next = options[(index + offset + options.length) % options.length];
  onSelect(next);
  buttons[options.indexOf(next)]?.focus();
}

// Settings-style section: what and why on the left, the fields on the right.
// Stacked on phones, separated by hairlines in both layouts.
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b border-slate-200 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

// A pill that is either on or off, with a check mark as the second cue
// next to the color.
export function ToggleChip({
  pressed,
  size = "md",
  onClick,
  children,
}: {
  pressed: boolean;
  size?: "md" | "sm";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border font-medium transition-[color,background-color,border-color,box-shadow] duration-150 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 active:translate-y-px ${
        size === "md"
          ? "h-11 px-3.5 text-sm sm:h-10"
          : "h-9 px-3 text-[13px]"
      } ${
        pressed
          ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-[inset_0_0_0_1px_theme(colors.indigo.600)]"
          : "border-slate-200 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
          pressed ? "bg-indigo-600 text-white" : "border border-slate-300"
        }`}
        aria-hidden
      >
        {pressed && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

export function tabId(prefix: string, tab: string): string {
  return `${prefix}-tab-${tab}`;
}

export function panelId(prefix: string, tab: string): string {
  return `${prefix}-panel-${tab}`;
}

// Underlined tabs with an optional count, switchable with the arrow keys.
export function TabBar<T extends string>({
  tabs,
  active,
  idPrefix,
  label,
  onSelect,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  idPrefix: string;
  label: string;
  onSelect: (tab: T) => void;
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + offset + tabs.length) % tabs.length].id;
    onSelect(next);
    document.getElementById(tabId(idPrefix, next))?.focus();
  }

  return (
    <div className="border-b border-slate-200">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="-mb-px flex gap-6 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId(idPrefix, tab.id)}
              aria-selected={selected}
              aria-controls={panelId(idPrefix, tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                selected
                  ? "border-indigo-600 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    selected
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
