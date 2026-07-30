import { createHash } from "crypto";
import type { ReportFields } from "@/lib/api/report-fields";

/**
 * Kanonski sadržaj za hash: preferira report_fields (Faza C), inače report tekst.
 * Stabilan JSON radi konzistentnog SHA-256.
 */
export function canonicalizeReportContentForHash(
  report: string | null | undefined,
  reportFields: ReportFields | Record<string, string> | null | undefined,
): string {
  const fields =
    reportFields &&
    typeof reportFields === "object" &&
    !Array.isArray(reportFields)
      ? reportFields
      : null;

  if (fields && Object.keys(fields).length > 0) {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(fields).sort((a, b) =>
      a.localeCompare(b, "en"),
    )) {
      sorted[key] = typeof fields[key] === "string" ? fields[key] : "";
    }
    return JSON.stringify({ format: "report_fields", fields: sorted });
  }

  const text = (report ?? "").trim();
  if (text) {
    return JSON.stringify({ format: "report", report: text });
  }

  return JSON.stringify({ format: "empty", report: "", fields: {} });
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashReportContent(
  report: string | null | undefined,
  reportFields: ReportFields | Record<string, string> | null | undefined,
): string {
  return sha256Hex(canonicalizeReportContentForHash(report, reportFields));
}

/** Format: "Zatvoren i potpisao X dana DD.MM.YYYY u HH:MM" / EN ekvivalent. */
export function buildSignatureStatement(params: {
  fullName: string;
  at: Date;
  locale: string;
}): string {
  const locale = params.locale === "en" ? "en" : "sr";
  const name =
    params.fullName.trim() || (locale === "en" ? "Unknown" : "Nepoznat");

  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-RS", {
    timeZone: "Europe/Belgrade",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(params.at);

  const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sr-RS", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(params.at);

  if (locale === "en") {
    return `Closed and signed by ${name} on ${date} at ${time}`;
  }
  return `Zatvoren i potpisao ${name} dana ${date} u ${time}`;
}

export type VisitAssignee = {
  user_id: string;
  full_name: string;
  email?: string | null;
  role: "primary" | "collaborator";
};

export type VisitSignatureRow = {
  user_id: string;
  full_name: string;
  signed_at: string;
  signature_statement: string;
  report_content_hash: string | null;
};

/** Svi koji moraju potpisati: primarni + saradnici (unique). */
export function requiredSignerIds(
  assignedUserId: string | null,
  collaboratorIds: string[],
): string[] {
  const set = new Set<string>();
  if (assignedUserId) set.add(assignedUserId);
  for (const id of collaboratorIds) set.add(id);
  return [...set];
}
