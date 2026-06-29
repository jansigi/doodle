import type { Availability, Role } from "./types";
import { ROLE_LABELS, formatDateGerman } from "./roles";

const AVAILABILITY_LABELS: Record<Availability, string> = {
  yes: "Ja",
  maybe: "Vielleicht",
  no: "Nein",
};

interface AvailabilityParticipant {
  name: string;
  roles: Role[];
  can_md: boolean;
  max_per_month: number | null;
  availability: Record<string, Availability>;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

export function downloadAvailabilityCsv(
  title: string,
  dates: string[],
  participants: AvailabilityParticipant[]
): void {
  const headers = [
    "Name",
    "Rollen",
    "MD",
    "Max pro Monat",
    ...dates.map((date) => formatDateGerman(date)),
  ];

  const rows = participants.map((participant) => [
    participant.name,
    participant.roles.map((role) => ROLE_LABELS[role]).join(", "),
    participant.can_md ? "Ja" : "Nein",
    participant.max_per_month?.toString() ?? "",
    ...dates.map((date) => {
      const value = participant.availability[date];
      return value ? AVAILABILITY_LABELS[value] : "";
    }),
  ]);

  const csv = [buildCsvRow(headers), ...rows.map(buildCsvRow)].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-verfuegbarkeiten.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
