import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Plan } from "./types";
import { formatDateGerman } from "./roles";

function withMdTag(name: string | null, mdName: string | null): string {
  if (!name) return "—";
  return name === mdName ? `${name} (MD)` : name;
}

function listWithMdTag(names: string[], mdName: string | null): string {
  if (names.length === 0) return "—";
  return names
    .map((name) => (name === mdName ? `${name} (MD)` : name))
    .join(", ");
}

export function downloadPlanPdf(title: string, plan: Plan): void {
  const document = new jsPDF({ orientation: "landscape" });
  document.setFontSize(16);
  document.text(title, 14, 15);

  const sortedDates = Object.keys(plan).sort();
  const rows = sortedDates.map((date) => {
    const assignment = plan[date];
    return [
      formatDateGerman(date),
      withMdTag(assignment.leader, assignment.md),
      withMdTag(assignment.coordinator, assignment.md),
      listWithMdTag(assignment.vocals, assignment.md),
      withMdTag(assignment.bass, assignment.md),
      listWithMdTag(assignment.egit, assignment.md),
      withMdTag(assignment.aguitar ?? null, assignment.md),
      withMdTag(assignment.drums, assignment.md),
      withMdTag(assignment.keys, assignment.md),
    ];
  });

  autoTable(document, {
    startY: 22,
    head: [
      [
        "Datum",
        "Worship Leader",
        "Vocal Coordinator",
        "Vocals",
        "Bass",
        "E-Gitarre",
        "A-Gitarre",
        "Drums",
        "Keys",
      ],
    ],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [67, 56, 202] },
  });

  document.save(`${title.replace(/[^\p{L}\p{N}]+/gu, "-")}.pdf`);
}
