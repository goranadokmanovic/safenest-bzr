/**
 * Dnevni cron: notifikacije za compliance_records rokove.
 * Pragovi: tačno 30/15/7/3/1 dana, ili days <= 0 (isteklo — jednom).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  todayBelgradeIso,
  type ComplianceRecordType,
} from "@/lib/compliance/types";

export const COMPLIANCE_NOTIFY_THRESHOLDS = [30, 15, 7, 3, 1] as const;

export type ComplianceNotifyThreshold =
  | (typeof COMPLIANCE_NOTIFY_THRESHOLDS)[number]
  | "expired";

export type ComplianceNotifyType =
  | "compliance_expiring"
  | "compliance_expired";

const TYPE_LABEL_SR: Record<ComplianceRecordType, string> = {
  medical_exam: "Lekarski pregled",
  training_certification: "Stručno osposobljavanje",
  equipment_check: "Pregled opreme",
};

type RecordRow = {
  id: string;
  agency_id: string;
  client_company_id: string;
  record_type: ComplianceRecordType;
  subject_type: string;
  subject_id: string | null;
  subject_name: string;
  category: string;
  expiry_date: string;
  client_companies: {
    name: string;
    assigned_collaborator_id: string | null;
    archived_at: string | null;
  } | null;
};

export type ComplianceNotifyRunResult = {
  today: string;
  scanned: number;
  matched: number;
  created: number;
  duplicates: number;
  errors: string[];
};

function parseDateOnly(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Kalendarski dani: expiry − today (Belgrade date-only). */
export function daysUntilExpiry(
  expiryDate: string,
  todayIso: string = todayBelgradeIso(),
): number {
  return Math.round(
    (parseDateOnly(expiryDate.trim()) - parseDateOnly(todayIso)) /
      (24 * 60 * 60 * 1000),
  );
}

export function matchNotifyThreshold(
  days: number,
): ComplianceNotifyThreshold | null {
  if (days <= 0) return "expired";
  if (
    (COMPLIANCE_NOTIFY_THRESHOLDS as readonly number[]).includes(days)
  ) {
    return days as ComplianceNotifyThreshold;
  }
  return null;
}

export function complianceDedupeKey(
  recordId: string,
  threshold: ComplianceNotifyThreshold,
): string {
  return `compliance-${recordId}-${threshold}`;
}

function buildCopy(
  row: RecordRow,
  days: number,
  threshold: ComplianceNotifyThreshold,
): {
  type: ComplianceNotifyType;
  severity: "warning" | "critical";
  title: string;
  body: string;
} {
  const typeLabel =
    TYPE_LABEL_SR[row.record_type] ?? row.record_type;
  const clientName = row.client_companies?.name ?? "klijent";
  const subject = row.subject_name.trim() || "—";
  const category = row.category.trim();

  if (threshold === "expired") {
    const when =
      days === 0
        ? "ističe danas"
        : days === -1
          ? "isteklo juče"
          : `isteklo pre ${Math.abs(days)} dana`;
    return {
      type: "compliance_expired",
      severity: "critical",
      title: days === 0 ? "Rok ističe danas" : "Rok je istekao",
      body: `${subject} · ${typeLabel}${category ? ` (${category})` : ""} · klijent ${clientName} · ${when}.`,
    };
  }

  return {
    type: "compliance_expiring",
    severity: "warning",
    title: `Rok ističe za ${threshold} ${threshold === 1 ? "dan" : "dana"}`,
    body: `${subject} · ${typeLabel}${category ? ` (${category})` : ""} · klijent ${clientName} · preostalo ${threshold} ${threshold === 1 ? "dan" : "dana"}.`,
  };
}

function buildHref(row: RecordRow): string {
  const base = `/agencija/klijenti/${row.client_company_id}?tab=rokovi`;
  if (row.subject_type === "worker" && row.subject_id) {
    return `${base}&worker_id=${encodeURIComponent(row.subject_id)}`;
  }
  return base;
}

async function agencyOwnerIds(
  admin: SupabaseClient,
  agencyId: string,
  cache: Map<string, string[]>,
): Promise<string[]> {
  const hit = cache.get(agencyId);
  if (hit) return hit;

  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("agency_id", agencyId)
    .eq("role", "agency_owner");

  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.user_id as string);
  cache.set(agencyId, ids);
  return ids;
}

function recipientIds(row: RecordRow, owners: string[]): string[] {
  const set = new Set<string>(owners);
  const assigned = row.client_companies?.assigned_collaborator_id;
  if (assigned) set.add(assigned);
  return [...set];
}

/**
 * Skenira compliance_records i kreira notifikacije za vlasnike + zaduženog saradnika.
 */
export async function runComplianceDeadlineNotifications(
  admin: SupabaseClient,
  todayIso: string = todayBelgradeIso(),
): Promise<ComplianceNotifyRunResult> {
  const result: ComplianceNotifyRunResult = {
    today: todayIso,
    scanned: 0,
    matched: 0,
    created: 0,
    duplicates: 0,
    errors: [],
  };

  const ownerCache = new Map<string, string[]>();
  const pageSize = 500;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("compliance_records")
      .select(
        `
        id,
        agency_id,
        client_company_id,
        record_type,
        subject_type,
        subject_id,
        subject_name,
        category,
        expiry_date,
        client_companies (
          name,
          assigned_collaborator_id,
          archived_at
        )
      `,
      )
      .not("expiry_date", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      result.errors.push(error.message);
      break;
    }

    const rawRows = data ?? [];
    if (rawRows.length === 0) break;

    const rows: RecordRow[] = rawRows.map((raw) => {
      const r = raw as RecordRow & {
        client_companies:
          | RecordRow["client_companies"]
          | RecordRow["client_companies"][];
      };
      const cc = Array.isArray(r.client_companies)
        ? (r.client_companies[0] ?? null)
        : r.client_companies;
      return { ...r, client_companies: cc };
    });

    for (const row of rows) {
      result.scanned += 1;
      if (row.client_companies?.archived_at) continue;
      if (!row.expiry_date) continue;

      const days = daysUntilExpiry(row.expiry_date, todayIso);
      const threshold = matchNotifyThreshold(days);
      if (!threshold) continue;
      result.matched += 1;

      let owners: string[];
      try {
        owners = await agencyOwnerIds(admin, row.agency_id, ownerCache);
      } catch (err) {
        result.errors.push(
          `${row.id}: owners ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      const recipients = recipientIds(row, owners);
      if (recipients.length === 0) {
        result.errors.push(`${row.id}: no recipients`);
        continue;
      }

      const copy = buildCopy(row, days, threshold);
      const dedupeKey = complianceDedupeKey(row.id, threshold);
      const metadata = {
        record_id: row.id,
        client_company_id: row.client_company_id,
        client_name: row.client_companies?.name ?? null,
        subject_name: row.subject_name,
        subject_id: row.subject_id,
        record_type: row.record_type,
        category: row.category,
        days_remaining: days,
        threshold: String(threshold),
        href: buildHref(row),
      };

      for (const userId of recipients) {
        const { error: insertErr } = await admin.from("notifications").insert({
          user_id: userId,
          agency_id: row.agency_id,
          type: copy.type,
          title: copy.title,
          body: copy.body,
          severity: copy.severity,
          dedupe_key: dedupeKey,
          metadata,
        });

        if (insertErr) {
          if (insertErr.code === "23505") {
            result.duplicates += 1;
          } else {
            result.errors.push(
              `${row.id}/${userId}: ${insertErr.message}`,
            );
          }
        } else {
          result.created += 1;
        }
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return result;
}
