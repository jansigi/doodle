import type { Availability, LineupConfig, RoleId } from "./types";
import { formatDateGerman, roleLabel } from "./roles";

const AVAILABILITY_LABELS: Record<Availability, string> = {
  yes: "Ja",
  maybe: "Vielleicht",
  no: "Nein",
};

// Same traffic-light colors as the availability matrix in the admin view.
const AVAILABILITY_FILLS: Record<Availability, string> = {
  yes: "FFDCFCE7",
  maybe: "FFFEF3C7",
  no: "FFFEE2E2",
};

const AVAILABILITY_FONTS: Record<Availability, string> = {
  yes: "FF166534",
  maybe: "FF92400E",
  no: "FFB91C1C",
};

interface AvailabilityParticipant {
  name: string;
  roles: RoleId[];
  can_md: boolean;
  max_per_month: number | null;
  availability: Record<string, Availability>;
}

function fileBaseName(title: string): string {
  return title.replace(/[^\p{L}\p{N}]+/gu, "-");
}

export async function downloadAvailabilityExcel(
  title: string,
  dates: string[],
  participants: AvailabilityParticipant[],
  config: LineupConfig
): Promise<void> {
  // Loaded on demand - the library is far bigger than the admin page itself.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Verfügbarkeiten", {
    // Name column and header row stay in place while scrolling.
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Rollen", key: "roles", width: 26 },
    { header: "MD", key: "md", width: 6 },
    { header: "Max pro Monat", key: "maxPerMonth", width: 15 },
    ...dates.map((date) => ({
      header: formatDateGerman(date),
      key: date,
      width: 14,
    })),
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4338CA" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  headerRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };

  participants.forEach((participant) => {
    const row = sheet.addRow({
      name: participant.name,
      roles: participant.roles.map((role) => roleLabel(config, role)).join(", "),
      md: participant.can_md ? "Ja" : "Nein",
      maxPerMonth: participant.max_per_month ?? "",
      ...Object.fromEntries(
        dates.map((date) => {
          const value = participant.availability[date];
          return [date, value ? AVAILABILITY_LABELS[value] : ""];
        })
      ),
    });
    dates.forEach((date, index) => {
      const value = participant.availability[date];
      if (!value) return;
      const cell = row.getCell(5 + index);
      cell.alignment = { horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: AVAILABILITY_FILLS[value] },
      };
      cell.font = { color: { argb: AVAILABILITY_FONTS[value] } };
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 4 + dates.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileBaseName(title)}-verfuegbarkeiten.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
