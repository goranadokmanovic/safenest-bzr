"use client";

import type { ReportFields } from "@/lib/api/report-fields";
import { sortReportFieldEntries } from "@/lib/api/report-fields";
import type { VisitAssignee, VisitSignatureRow } from "@/lib/api/report-signature";

type Props = {
  agencyName: string;
  brojNaloga: string | null;
  clientName: string | null;
  visitDate: string;
  reportFields: ReportFields | null;
  legacyReport: string;
  signatures: VisitSignatureRow[];
  assignees: VisitAssignee[];
  labels: {
    title: string;
    agency: string;
    orderNumber: string;
    client: string;
    visitDate: string;
    workers: string;
    signatures: string;
    noData: string;
  };
};

/**
 * Print-only layout — sakriven na ekranu, vidljiv u @media print.
 */
export function ReportPrintView({
  agencyName,
  brojNaloga,
  clientName,
  visitDate,
  reportFields,
  legacyReport,
  signatures,
  assignees,
  labels,
}: Props) {
  const entries =
    reportFields && Object.keys(reportFields).length > 0
      ? sortReportFieldEntries(Object.entries(reportFields))
      : [];

  return (
    <div id="report-print-root" className="hidden print:block">
      <h1 className="mb-4 text-xl font-bold">{labels.title}</h1>
      <dl className="mb-6 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-40 font-semibold">{labels.agency}</dt>
          <dd>{agencyName || labels.noData}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-semibold">{labels.orderNumber}</dt>
          <dd>{brojNaloga || labels.noData}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-semibold">{labels.client}</dt>
          <dd>{clientName || labels.noData}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-semibold">{labels.visitDate}</dt>
          <dd>{visitDate || labels.noData}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-semibold">{labels.workers}</dt>
          <dd>
            {assignees.length > 0
              ? assignees.map((a) => a.full_name).join(", ")
              : labels.noData}
          </dd>
        </div>
      </dl>

      <section className="mb-8 space-y-3 text-sm">
        {entries.length > 0
          ? entries.map(([name, value]) => (
              <div key={name} className="border-b border-black/20 pb-2">
                <p className="font-semibold">{name}</p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {value?.trim() || "—"}
                </p>
              </div>
            ))
          : legacyReport.trim()
            ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {legacyReport}
                </pre>
              )
            : (
                <p>{labels.noData}</p>
              )}
      </section>

      <section className="mt-8 border-t border-black pt-4 text-sm">
        <p className="mb-2 font-semibold">{labels.signatures}</p>
        {signatures.length > 0 ? (
          <ul className="space-y-1">
            {signatures.map((s) => (
              <li key={s.user_id} className="italic">
                {s.signature_statement}
              </li>
            ))}
          </ul>
        ) : (
          <p>{labels.noData}</p>
        )}
      </section>
    </div>
  );
}
