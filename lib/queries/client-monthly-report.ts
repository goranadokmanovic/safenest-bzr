/**
 * Mesečni izveštaj za jednog klijenta: posete u periodu + compliance sa
 * expiry_date unutar meseca. Koristi ga Zrna alat generateClientMonthlyReport.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getComplianceStatus,
  type ComplianceRecordType,
  type ComplianceStatusKind,
} from "@/lib/compliance/types";
import { visitNotes } from "@/lib/field-visits/display";
import type { FieldVisitMetadata } from "@/lib/field-visits/types";
import type { QueryResult, ScopedClient } from "@/lib/queries/clients";
import type { ResolvedPeriod } from "@/lib/queries/field-visits";

const MAX_VISITS = 500;
const MAX_COMPLIANCE = 200;
const NOTES_EXCERPT = 250;

export type RiskLevel = "low" | "medium" | "high";
export type RiskTrend =
  | "improving"
  | "stable"
  | "worsening"
  | "insufficient_data";

export type MonthlyVisitRow = {
  visit_id: string;
  scheduled_at: string;
  status: string;
  risk_level: RiskLevel | null;
  notes_excerpt: string | null;
  assigned_user_name: string | null;
};

export type MonthlyComplianceItem = {
  subject_name: string;
  record_type: ComplianceRecordType;
  category: string | null;
  expiry_date: string;
  status: ComplianceStatusKind;
  days_remaining: number | null;
};

export type ClientMonthlyReportData = {
  client: ScopedClient;
  period: ResolvedPeriod;
  visits: {
    total: number;
    by_status: Record<string, number>;
    by_risk: {
      low: number;
      medium: number;
      high: number;
      unknown: number;
    };
    risk_trend: RiskTrend;
    /** Sve skenirane posete u mesecu (do MAX_VISITS), hronološki. */
    rows: MonthlyVisitRow[];
    truncated: boolean;
  };
  compliance: {
    expired_in_period: number;
    expiring_in_period: number;
    items: MonthlyComplianceItem[];
    truncated: boolean;
  };
};

export type ClientMonthlyReportInput = {
  agencyId: string;
  client: ScopedClient;
  period: ResolvedPeriod;
  todayIso: string;
};

function parseRisk(raw: unknown): RiskLevel | null {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return null;
}

function excerpt(text: string | null, max: number): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function dayIsoFromScheduledAt(scheduledAt: string): string | null {
  const d = scheduledAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Udeo high rizika među posetama sa poznatim risk_level.
 * null ako nema nijedne sa poznatim rizikom.
 */
function highShare(risks: Array<RiskLevel | null>): number | null {
  let known = 0;
  let high = 0;
  for (const r of risks) {
    if (!r) continue;
    known += 1;
    if (r === "high") high += 1;
  }
  if (known === 0) return null;
  return high / known;
}

/**
 * Poredi udeo high rizika u prvoj vs drugoj polovini perioda.
 * Manje od 2 posete → insufficient_data.
 */
export function computeRiskTrend(
  visits: Array<{ scheduled_at: string; risk_level: RiskLevel | null }>,
  period: ResolvedPeriod,
): RiskTrend {
  if (visits.length < 2) return "insufficient_data";

  const mid =
    period.from <= period.to
      ? (() => {
          const [fy, fm, fd] = period.from.split("-").map(Number);
          const [ty, tm, td] = period.to.split("-").map(Number);
          const fromMs = Date.UTC(fy!, (fm ?? 1) - 1, fd ?? 1);
          const toMs = Date.UTC(ty!, (tm ?? 1) - 1, td ?? 1);
          const midMs = Math.floor((fromMs + toMs) / 2);
          return new Date(midMs).toISOString().slice(0, 10);
        })()
      : period.from;

  const first: Array<RiskLevel | null> = [];
  const second: Array<RiskLevel | null> = [];
  for (const v of visits) {
    const day = dayIsoFromScheduledAt(v.scheduled_at);
    if (!day) {
      first.push(v.risk_level);
      continue;
    }
    if (day <= mid) first.push(v.risk_level);
    else second.push(v.risk_level);
  }

  if (first.length === 0 || second.length === 0) return "insufficient_data";

  const a = highShare(first);
  const b = highShare(second);
  if (a === null || b === null) return "insufficient_data";

  const eps = 0.05;
  if (b < a - eps) return "improving";
  if (b > a + eps) return "worsening";
  return "stable";
}

export async function getClientMonthlyReportData(
  supabase: SupabaseClient,
  input: ClientMonthlyReportInput,
): Promise<QueryResult<ClientMonthlyReportData>> {
  const { agencyId, client, period, todayIso } = input;

  const visitsQuery = supabase
    .from("field_visits")
    .select("id, scheduled_at, status, notes, metadata, assigned_user_id")
    .eq("agency_id", agencyId)
    .eq("client_company_id", client.id)
    .gte("scheduled_at", `${period.from}T00:00:00.000Z`)
    .lte("scheduled_at", `${period.to}T23:59:59.999Z`)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_VISITS + 1);

  const complianceQuery = supabase
    .from("compliance_records")
    .select("id, subject_name, record_type, category, expiry_date")
    .eq("agency_id", agencyId)
    .eq("client_company_id", client.id)
    .not("expiry_date", "is", null)
    .gte("expiry_date", period.from)
    .lte("expiry_date", period.to)
    .order("expiry_date", { ascending: true })
    .limit(MAX_COMPLIANCE + 1);

  const [visitsRes, complianceRes] = await Promise.all([
    visitsQuery,
    complianceQuery,
  ]);

  if (visitsRes.error) {
    return { ok: false, message: visitsRes.error.message };
  }
  if (complianceRes.error) {
    return { ok: false, message: complianceRes.error.message };
  }

  const visitRowsRaw = visitsRes.data ?? [];
  const visitsTruncated = visitRowsRaw.length > MAX_VISITS;
  const visitRows = visitRowsRaw.slice(0, MAX_VISITS);

  const assigneeIds = [
    ...new Set(
      visitRows
        .map((r) => r.assigned_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", assigneeIds);
    for (const p of profiles ?? []) {
      names.set(
        p.user_id as string,
        (p.full_name as string | null)?.trim() ||
          (p.email as string | null) ||
          (p.user_id as string).slice(0, 8),
      );
    }
  }

  const byStatus: Record<string, number> = {};
  const byRisk = { low: 0, medium: 0, high: 0, unknown: 0 };
  const forTrend: Array<{
    scheduled_at: string;
    risk_level: RiskLevel | null;
  }> = [];
  const rows: MonthlyVisitRow[] = [];

  for (const row of visitRows) {
    const status = String(row.status ?? "unknown");
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    const meta = (row.metadata ?? {}) as FieldVisitMetadata;
    const risk = parseRisk(meta.risk_level);
    if (risk) byRisk[risk] += 1;
    else byRisk.unknown += 1;

    const scheduledAt = String(row.scheduled_at ?? "");
    forTrend.push({ scheduled_at: scheduledAt, risk_level: risk });

    const notes = visitNotes(row.notes as string | null, meta);
    const assignedId = row.assigned_user_id as string | null;
    rows.push({
      visit_id: String(row.id),
      scheduled_at: scheduledAt,
      status,
      risk_level: risk,
      notes_excerpt: excerpt(notes, NOTES_EXCERPT),
      assigned_user_name: assignedId
        ? (names.get(assignedId) ?? null)
        : null,
    });
  }

  const complianceRowsRaw = complianceRes.data ?? [];
  const complianceTruncated = complianceRowsRaw.length > MAX_COMPLIANCE;
  const complianceRows = complianceRowsRaw.slice(0, MAX_COMPLIANCE);

  let expiredInPeriod = 0;
  let expiringInPeriod = 0;
  const items: MonthlyComplianceItem[] = [];

  for (const row of complianceRows) {
    const expiry = String(row.expiry_date ?? "").slice(0, 10);
    if (!expiry) continue;
    const status = getComplianceStatus(expiry, todayIso);
    if (status.kind === "expired") expiredInPeriod += 1;
    else if (status.kind === "expiring") expiringInPeriod += 1;

    items.push({
      subject_name: String(row.subject_name ?? ""),
      record_type: row.record_type as ComplianceRecordType,
      category: (row.category as string | null) ?? null,
      expiry_date: expiry,
      status: status.kind,
      days_remaining: status.daysRemaining,
    });
  }

  return {
    ok: true,
    value: {
      client,
      period,
      visits: {
        total: visitRows.length,
        by_status: byStatus,
        by_risk: byRisk,
        risk_trend: computeRiskTrend(forTrend, period),
        rows,
        truncated: visitsTruncated,
      },
      compliance: {
        expired_in_period: expiredInPeriod,
        expiring_in_period: expiringInPeriod,
        items,
        truncated: complianceTruncated,
      },
    },
  };
}
