// Upper bound for the dates of one doodle, far above a semester of weekly
// celebrations. Keeps a broken request from storing a huge array.
export const MAX_DATES = 200;

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  // Rejects dates that do not exist, e.g. 2026-02-30.
  return toIsoDate(new Date(value + "T00:00:00")) === value;
}

// Validates the dates of a doodle as sent by the client: real ISO dates, at
// least one, without duplicates and sorted.
export function parseDates(
  raw: unknown
): { dates: string[] } | { error: string } {
  const values = Array.isArray(raw) ? raw : [];
  if (values.length === 0) return { error: "Mindestens ein Datum angeben" };
  if (!values.every(isIsoDate)) return { error: "Ungültiges Datum" };
  const dates = [...new Set(values)].sort();
  if (dates.length > MAX_DATES)
    return { error: `Höchstens ${MAX_DATES} Termine möglich` };
  return { dates };
}

// Every given weekday (0 = Sonntag, as in Date.getDay()) from start to end,
// both inclusive.
export function weeklyDates(
  weekday: number,
  start: string,
  end: string
): string[] {
  if (!start || !end || end < start) return [];
  const current = new Date(start + "T00:00:00");
  current.setDate(current.getDate() + ((weekday - current.getDay() + 7) % 7));
  const dates: string[] = [];
  while (toIsoDate(current) <= end) {
    dates.push(toIsoDate(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

export function groupByMonth(
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
