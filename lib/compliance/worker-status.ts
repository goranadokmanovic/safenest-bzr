/**
 * Agregacija compliance_records po radniku (subject_id) za bedž u tabeli radnika.
 * Prioritet najgoreg statusa: expired → missing → expiring → valid.
 */

import {
  getComplianceStatus,
  type ComplianceRecord,
  type ComplianceStatusKind,
} from "@/lib/compliance/types";

export type WorkerDeadlineKind = ComplianceStatusKind | "none";

export type WorkerDeadlineAggregate = {
  kind: WorkerDeadlineKind;
  counts: Record<ComplianceStatusKind, number>;
  total: number;
};

const SEVERITY: Record<ComplianceStatusKind, number> = {
  expired: 0,
  missing: 1,
  expiring: 2,
  valid: 3,
};

const EMPTY_COUNTS: Record<ComplianceStatusKind, number> = {
  missing: 0,
  expired: 0,
  expiring: 0,
  valid: 0,
};

export function aggregateWorkerDeadlines(
  records: Pick<
    ComplianceRecord,
    "subject_id" | "subject_type" | "expiry_date"
  >[],
  workerId: string,
  todayIso?: string,
): WorkerDeadlineAggregate {
  const counts = { ...EMPTY_COUNTS };
  let total = 0;
  let worst: ComplianceStatusKind | null = null;

  for (const row of records) {
    if (row.subject_type !== "worker" || row.subject_id !== workerId) continue;
    const { kind } = getComplianceStatus(row.expiry_date, todayIso);
    counts[kind] += 1;
    total += 1;
    if (worst === null || SEVERITY[kind] < SEVERITY[worst]) {
      worst = kind;
    }
  }

  if (total === 0 || worst === null) {
    return { kind: "none", counts, total: 0 };
  }

  return { kind: worst, counts, total };
}

/** Brojači u fiksnom redosledu za čitljiv sažetak. */
const SUMMARY_ORDER: ComplianceStatusKind[] = [
  "expired",
  "missing",
  "expiring",
  "valid",
];

/**
 * Gradi tekst tipa „2 važeća, 1 ističe uskoro” iz i18n šablona sa `{count}`.
 */
export function formatDeadlineSummary(
  counts: Record<ComplianceStatusKind, number>,
  templates: Record<ComplianceStatusKind, string>,
): string {
  return SUMMARY_ORDER.filter((k) => counts[k] > 0)
    .map((k) => templates[k].replace("{count}", String(counts[k])))
    .join(", ");
}

export const WORKER_DEADLINE_BADGE_CLASS: Record<WorkerDeadlineKind, string> = {
  none: "bzr-badge-neutral",
  missing: "bg-ink/10 text-ink/70",
  expired: "bg-red-100 text-red-900",
  expiring: "bg-amber-100 text-amber-900",
  valid: "bg-emerald-100 text-emerald-900",
};
