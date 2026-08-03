/**
 * Client-side .xlsx za mesečni izveštaj (ExcelJS — stilovi; SheetJS ostaje
 * za bulk import u lib/import/parse-sheet.ts).
 */

import { recordTypeLabel } from "@/lib/agent/tools/shared";
import type { ComplianceRecordType } from "@/lib/compliance/types";
import type ExcelJS from "exceljs";

type ExcelJsModule = typeof import("exceljs");

let excelJsPromise: Promise<ExcelJsModule> | null = null;

function loadExcelJs(): Promise<ExcelJsModule> {
  if (!excelJsPromise) {
    excelJsPromise = import("exceljs").then((mod) => {
      const candidate = mod as ExcelJsModule & { default?: ExcelJsModule };
      if (typeof candidate.Workbook === "function") return candidate;
      if (candidate.default && typeof candidate.default.Workbook === "function") {
        return candidate.default;
      }
      return candidate;
    });
    excelJsPromise.catch(() => {
      excelJsPromise = null;
    });
  }
  return excelJsPromise;
}

export type MonthlyReportWorkbookLocale = "sr" | "en";

export type MonthlyReportWorkbookLabels = {
  sheetVisits: string;
  sheetCompliance: string;
  colDate: string;
  colStatus: string;
  colRisk: string;
  colNotes: string;
  colAssignee: string;
  colSubject: string;
  colRecordType: string;
  colExpiry: string;
  colCategory: string;
  visitStatus: {
    scheduled: string;
    in_progress: string;
    completed: string;
    cancelled: string;
    draft: string;
    unknown: string;
  };
  risk: {
    low: string;
    medium: string;
    high: string;
    unknown: string;
  };
  complianceStatus: {
    expired: string;
    expiring: string;
    valid: string;
    missing: string;
  };
};

export type MonthlyReportExportData = {
  client: { name?: string | null };
  period: { from?: string | null; label?: string | null };
  visits?: {
    rows?: Array<{
      scheduled_at?: string | null;
      status?: string | null;
      risk_level?: string | null;
      notes_excerpt?: string | null;
      assigned_user_name?: string | null;
    }>;
  };
  compliance?: {
    items?: Array<{
      subject_name?: string | null;
      record_type?: string | null;
      category?: string | null;
      expiry_date?: string | null;
      status?: string | null;
    }>;
  };
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8E8E8" },
};

function visitStatusLabel(
  status: string | null | undefined,
  labels: MonthlyReportWorkbookLabels,
): string {
  const key = (status ?? "unknown") as keyof typeof labels.visitStatus;
  return labels.visitStatus[key] ?? labels.visitStatus.unknown;
}

function riskLabel(
  risk: string | null | undefined,
  labels: MonthlyReportWorkbookLabels,
): string {
  if (risk === "low" || risk === "medium" || risk === "high") {
    return labels.risk[risk];
  }
  return labels.risk.unknown;
}

function complianceStatusLabel(
  status: string | null | undefined,
  labels: MonthlyReportWorkbookLabels,
): string {
  const key = (status ?? "missing") as keyof typeof labels.complianceStatus;
  return labels.complianceStatus[key] ?? labels.complianceStatus.missing;
}

function formatDateCell(value: string | null | undefined): string {
  if (!value) return "";
  const raw = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value;
  const [y, m, d] = raw.split("-");
  return `${d}.${m}.${y}.`;
}

function sanitizeFilenamePart(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "client"
  );
}

export function monthlyReportFilename(data: MonthlyReportExportData): string {
  const client = sanitizeFilenamePart(String(data.client?.name ?? "client"));
  const period =
    typeof data.period?.from === "string" && data.period.from.length >= 7
      ? data.period.from.slice(0, 7)
      : "period";
  return `${client}_${period}.xlsx`;
}

function styleHeaderRow(row: ExcelJS.Row, columnCount: number): void {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    cell.border = THIN_BORDER;
    cell.fill = HEADER_FILL;
    cell.font = { bold: true };
  }
}

function styleDataRow(row: ExcelJS.Row, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    row.getCell(col).border = THIN_BORDER;
  }
}

function addSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: string[][],
  columnWidths: number[],
  wrapColumnIndexes: number[] = [],
): void {
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.addRow(headers);
  styleHeaderRow(sheet.getRow(1), headers.length);

  for (const values of rows) {
    const row = sheet.addRow(values);
    styleDataRow(row, headers.length);
    for (const colIndex of wrapColumnIndexes) {
      row.getCell(colIndex).alignment = { wrapText: true, vertical: "top" };
    }
  }

  sheet.columns = columnWidths.map((width) => ({ width }));
  // Re-apply wrap on Notes after columns assignment (ExcelJS can reset alignment).
  if (wrapColumnIndexes.length > 0 && rows.length > 0) {
    for (let r = 2; r <= rows.length + 1; r += 1) {
      for (const colIndex of wrapColumnIndexes) {
        sheet.getRow(r).getCell(colIndex).alignment = {
          wrapText: true,
          vertical: "top",
        };
      }
    }
  }
}

export async function buildMonthlyReportWorkbook(
  data: MonthlyReportExportData,
  labels: MonthlyReportWorkbookLabels,
  locale: MonthlyReportWorkbookLocale,
): Promise<Blob> {
  const ExcelJSMod = await loadExcelJs();
  const workbook = new ExcelJSMod.Workbook();
  workbook.creator = "SafeNest BZR";
  workbook.created = new Date();

  const visitHeader = [
    labels.colDate,
    labels.colStatus,
    labels.colRisk,
    labels.colNotes,
    labels.colAssignee,
  ];
  const visitRows = (data.visits?.rows ?? []).map((row) => [
    formatDateCell(row.scheduled_at),
    visitStatusLabel(row.status, labels),
    riskLabel(row.risk_level, labels),
    row.notes_excerpt?.trim() ?? "",
    row.assigned_user_name?.trim() ?? "",
  ]);

  const complianceHeader = [
    labels.colSubject,
    labels.colRecordType,
    labels.colCategory,
    labels.colExpiry,
    labels.colStatus,
  ];
  const complianceRows = (data.compliance?.items ?? []).map((row) => [
    row.subject_name?.trim() ?? "",
    row.record_type
      ? recordTypeLabel(row.record_type as ComplianceRecordType, locale)
      : "",
    row.category?.trim() ?? "",
    formatDateCell(row.expiry_date),
    complianceStatusLabel(row.status, labels),
  ]);

  addSheet(
    workbook,
    labels.sheetVisits,
    visitHeader,
    visitRows,
    [12, 14, 10, 45, 18],
    [4], // Notes
  );
  addSheet(
    workbook,
    labels.sheetCompliance,
    complianceHeader,
    complianceRows,
    [24, 22, 20, 12, 14],
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
