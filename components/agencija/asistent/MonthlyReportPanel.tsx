"use client";

import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  buildMonthlyReportWorkbook,
  downloadBlob,
  monthlyReportFilename,
  type MonthlyReportExportData,
  type MonthlyReportWorkbookLabels,
} from "@/lib/agent/monthly-report-workbook";
import { recordTypeLabel } from "@/lib/agent/tools/shared";
import type { ComplianceRecordType } from "@/lib/compliance/types";
import { getMessages, normalizeLocale, type Locale } from "@/lib/i18n";

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Row => !!asRecord(v));
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDateOnly(value: unknown): string {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return text(value);
  const [y, m, d] = raw.split("-");
  return `${d}.${m}.${y}.`;
}

function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/**
 * Jezik izveštaja = locale u trenutku generisanja (tool `narrative_locale`),
 * ne trenutni UI toggle — da Excel/tabele prate konverzaciju.
 */
function resolveReportLocale(
  data: Row,
  uiLocale: Locale,
): Locale {
  if (data.narrative_locale === "en" || data.narrative_locale === "sr") {
    return data.narrative_locale;
  }
  return normalizeLocale(uiLocale);
}

export function MonthlyReportPanel({ data }: { data: Row }) {
  const { locale: uiLocale } = useTranslations();
  const reportLocale = resolveReportLocale(data, uiLocale);
  const mr = getMessages(reportLocale).dashboard.assistant.monthlyReport;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const clientRec = asRecord(data.client);
  const periodRec = asRecord(data.period);
  const visitsRec = asRecord(data.visits);
  const complianceRec = asRecord(data.compliance);

  const clientName = text(clientRec?.name);
  const periodLabel = text(periodRec?.label);
  const visitTotal =
    typeof visitsRec?.total === "number" ? visitsRec.total : 0;
  const expiredCount =
    typeof complianceRec?.expired_in_period === "number"
      ? complianceRec.expired_in_period
      : 0;

  const visitRows = asRows(visitsRec?.rows);
  const complianceRows = asRows(complianceRec?.items);
  const narrative =
    typeof data.narrative === "string" && data.narrative.trim()
      ? data.narrative.trim()
      : null;

  const workbookLabels: MonthlyReportWorkbookLabels = {
    sheetVisits: mr.sheetVisits,
    sheetCompliance: mr.sheetCompliance,
    colDate: mr.colDate,
    colStatus: mr.colStatus,
    colRisk: mr.colRisk,
    colNotes: mr.colNotes,
    colAssignee: mr.colAssignee,
    colSubject: mr.colSubject,
    colRecordType: mr.colRecordType,
    colExpiry: mr.colExpiry,
    colCategory: mr.colCategory,
    visitStatus: mr.visitStatus,
    risk: mr.risk,
    complianceStatus: mr.complianceStatus,
  };

  const visitStatusLabel = (status: unknown): string => {
    const key = String(status ?? "unknown") as keyof typeof mr.visitStatus;
    return mr.visitStatus[key] ?? mr.visitStatus.unknown;
  };

  const riskLabel = (risk: unknown): string => {
    if (risk === "low" || risk === "medium" || risk === "high") {
      return mr.risk[risk];
    }
    return mr.risk.unknown;
  };

  const complianceStatusLabel = (status: unknown): string => {
    const key = String(
      status ?? "missing",
    ) as keyof typeof mr.complianceStatus;
    return mr.complianceStatus[key] ?? mr.complianceStatus.missing;
  };

  async function handleDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      const exportData = data as unknown as MonthlyReportExportData;
      const blob = await buildMonthlyReportWorkbook(
        exportData,
        workbookLabels,
        reportLocale,
      );
      downloadBlob(blob, monthlyReportFilename(exportData));
    } catch {
      setDownloadError(mr.downloadFailed);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-ink/70">
          {fillTemplate(mr.summaryLine, {
            client: clientName,
            period: periodLabel,
            visits: visitTotal,
            expired: expiredCount,
          })}
        </p>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="shrink-0 rounded-md border border-border/50 bg-surface px-2.5 py-1 text-[0.7rem] font-medium text-ink/85 transition hover:border-accent/40 hover:text-accent disabled:opacity-60"
        >
          {downloading ? mr.downloading : mr.downloadExcel}
        </button>
      </div>

      {downloadError ? (
        <p className="text-danger">{downloadError}</p>
      ) : null}

      {narrative ? (
        <p className="text-sm leading-relaxed text-ink/85">{narrative}</p>
      ) : null}

      <div>
        <p className="mb-1.5 font-medium text-ink/80">{mr.visitsHeading}</p>
        {visitRows.length === 0 ? (
          <p className="text-ink/55">{mr.emptyVisits}</p>
        ) : (
          <div className="max-h-56 overflow-auto rounded-md border border-border/30">
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <thead className="sticky top-0 bg-surface/95">
                <tr className="text-ink/55">
                  <th className="px-2 py-1.5 font-medium">{mr.colDate}</th>
                  <th className="px-2 py-1.5 font-medium">{mr.colStatus}</th>
                  <th className="px-2 py-1.5 font-medium">{mr.colRisk}</th>
                  <th className="px-2 py-1.5 font-medium">{mr.colNotes}</th>
                </tr>
              </thead>
              <tbody>
                {visitRows.map((row, i) => (
                  <tr key={i} className="border-t border-border/25">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {formatDateOnly(row.scheduled_at)}
                    </td>
                    <td className="px-2 py-1.5">
                      {visitStatusLabel(row.status)}
                    </td>
                    <td className="px-2 py-1.5">
                      {riskLabel(row.risk_level)}
                    </td>
                    <td className="max-w-[14rem] px-2 py-1.5">
                      <span className="line-clamp-2">
                        {text(row.notes_excerpt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visitsRec?.truncated === true ? (
          <p className="mt-1 text-ink/50">{mr.truncatedVisits}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 font-medium text-ink/80">{mr.complianceHeading}</p>
        {complianceRows.length === 0 ? (
          <p className="text-ink/55">{mr.emptyCompliance}</p>
        ) : (
          <div className="max-h-56 overflow-auto rounded-md border border-border/30">
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <thead className="sticky top-0 bg-surface/95">
                <tr className="text-ink/55">
                  <th className="px-2 py-1.5 font-medium">{mr.colSubject}</th>
                  <th className="px-2 py-1.5 font-medium">
                    {mr.colRecordType}
                  </th>
                  <th className="px-2 py-1.5 font-medium">{mr.colExpiry}</th>
                  <th className="px-2 py-1.5 font-medium">{mr.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((row, i) => (
                  <tr key={i} className="border-t border-border/25">
                    <td className="px-2 py-1.5">{text(row.subject_name)}</td>
                    <td className="px-2 py-1.5">
                      {typeof row.record_type === "string"
                        ? recordTypeLabel(
                            row.record_type as ComplianceRecordType,
                            reportLocale,
                          )
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {formatDateOnly(row.expiry_date)}
                    </td>
                    <td className="px-2 py-1.5">
                      {complianceStatusLabel(row.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {complianceRec?.truncated === true ? (
          <p className="mt-1 text-ink/50">{mr.truncatedCompliance}</p>
        ) : null}
      </div>
    </div>
  );
}
