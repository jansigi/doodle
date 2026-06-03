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
  const pdf = new jsPDF({ orientation: "landscape" });

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

  autoTable(pdf, {
    startY: 24,
    margin: { top: 24, left: 14, right: 14, bottom: 16 },
    // Keep each celebration on one page - never split a row across pages.
    rowPageBreak: "avoid",
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
    styles: { fontSize: 9, cellPadding: 2.5, valign: "middle" },
    headStyles: { fillColor: [67, 56, 202] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 32 },
    },
    // Title on every page so follow-up pages are self-explanatory.
    didDrawPage: () => {
      pdf.setFontSize(14);
      pdf.setTextColor(30, 41, 59);
      pdf.text(title, 14, 16);
    },
  });

  // Footer with creation date and page numbers on every page.
  const pageCount = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const createdAt = new Date().toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  Array.from({ length: pageCount }, (_, index) => index + 1).forEach(
    (pageNumber) => {
      pdf.setPage(pageNumber);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 130, 145);
      pdf.text(`Erstellt am ${createdAt}`, 14, pageHeight - 8);
      pdf.text(
        `Seite ${pageNumber} von ${pageCount}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: "right" }
      );
    }
  );

  pdf.save(`${title.replace(/[^\p{L}\p{N}]+/gu, "-")}.pdf`);
}
