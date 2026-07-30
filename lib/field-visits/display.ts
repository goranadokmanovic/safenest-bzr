import type { FieldVisitMetadata } from "@/lib/field-visits/types";

export type { FieldVisitMetadata } from "@/lib/field-visits/types";
export type { FieldVisit, FieldVisitInsertPayload } from "@/lib/field-visits/types";

export type FieldVisitMeta = FieldVisitMetadata;

export type VisitStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "cancelled";

export type SyncStatus = "pending" | "synced" | "failed";

export type RiskLevel = "low" | "medium" | "high";

export function metaNum(
  meta: FieldVisitMetadata | null | undefined,
  key: string,
): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function metaStr(
  meta: FieldVisitMetadata | null | undefined,
  key: string,
): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function formatVisitDate(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(
      locale === "en" ? "en-GB" : "sr-Latn-RS",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  } catch {
    return iso;
  }
}

/** Ručno uneto trajanje (sati) — tipična terenska poseta. */
export const MAX_MANUAL_DURATION_HOURS = 24;
/** Gornja granica za razliku started_at/completed_at (7 dana). */
export const MAX_COMPUTED_DURATION_HOURS = 168;

function parseDurationCandidate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function roundDurationHours(hours: number): number {
  // Jedna decimala (npr. 1.5h), bez lažne preciznosti.
  return Math.round(hours * 10) / 10;
}

function hoursBetween(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): number | null {
  if (!startedAt?.trim() || !completedAt?.trim()) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  return (end - start) / (1000 * 60 * 60);
}

/**
 * Trajanje za prikaz:
 * 1) validno ručno `metadata.duration_hours` (0 < h ≤ 24)
 * 2) inače razlika completed_at − started_at ako oba postoje
 * 3) inače null (UI prikazuje "—" / "U toku")
 *
 * Apsurdne vrednosti (npr. 6526 = verovatno sekunde snimka upisane kao sati)
 * se ignorišu.
 */
export function resolveVisitDurationHours(input: {
  metadata?: FieldVisitMetadata | null;
  started_at?: string | null;
  completed_at?: string | null;
}): number | null {
  const manual = parseDurationCandidate(input.metadata?.duration_hours);
  if (
    manual != null &&
    manual > 0 &&
    manual <= MAX_MANUAL_DURATION_HOURS
  ) {
    return roundDurationHours(manual);
  }

  const computed = hoursBetween(input.started_at, input.completed_at);
  if (
    computed != null &&
    computed > 0 &&
    computed <= MAX_COMPUTED_DURATION_HOURS
  ) {
    return roundDurationHours(computed);
  }

  return null;
}

/** Formatira trajanje za listu/modal; null → pozivalac prikaže "—" ili "U toku". */
export function formatDurationHours(
  meta: FieldVisitMetadata | null | undefined,
  hoursSuffix: string,
  timestamps?: {
    started_at?: string | null;
    completed_at?: string | null;
  },
): string | null {
  const h = resolveVisitDurationHours({
    metadata: meta,
    started_at: timestamps?.started_at,
    completed_at: timestamps?.completed_at,
  });
  if (h == null) return null;
  const label = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${label}${hoursSuffix}`;
}

export function normalizeRiskLevel(
  raw: string | null | undefined,
): RiskLevel | null {
  const v = raw?.toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

export function normalizeSyncStatus(
  raw: string | null | undefined,
  isLocal: boolean,
): SyncStatus {
  if (isLocal) return "pending";
  if (raw === "synced" || raw === "failed" || raw === "pending") return raw;
  return "pending";
}

export function normalizeVisitStatus(
  raw: string | null | undefined,
): VisitStatus {
  if (raw === "scheduled") return "draft";
  if (
    raw === "draft" ||
    raw === "in_progress" ||
    raw === "completed" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "draft";
}

/** Napomene: prvo kolona notes, zatim legacy metadata.notes */
export function visitNotes(
  notesColumn: string | null | undefined,
  meta?: FieldVisitMetadata | null,
): string | null {
  if (notesColumn?.trim()) return notesColumn.trim();
  return metaStr(meta, "notes");
}

export function truncateText(text: string | null, max: number): string {
  if (!text?.trim()) return "—";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Mapira offline queue payload (uključujući legacy ključeve) na insert payload */
export function mapLegacyOfflineVisitData(data: Record<string, unknown>): {
  client_company_id: string;
  scheduled_at: string;
  status: VisitStatus;
  sync_status: SyncStatus;
  notes: string | null;
  metadata: FieldVisitMetadata;
  assigned_user_id?: string;
  offline_client_id?: string;
  hitno_otklanjanje?: boolean;
} {
  const meta: FieldVisitMetadata = {
    ...((data.metadata as FieldVisitMetadata) ?? {}),
  };

  const notes =
    (typeof data.notes === "string" && data.notes.trim()
      ? data.notes.trim()
      : null) ??
    metaStr(meta, "notes");

  if (notes && meta.notes === notes) {
    delete meta.notes;
  }

  const scheduled =
    (typeof data.scheduled_at === "string" && data.scheduled_at) ||
    (typeof data.visit_date === "string" && data.visit_date) ||
    new Date().toISOString();

  return {
    client_company_id: String(data.client_company_id),
    scheduled_at: scheduled,
    status: normalizeVisitStatus(
      typeof data.status === "string" ? data.status : undefined,
    ),
    sync_status: "pending",
    notes,
    metadata: meta,
    ...(typeof data.assigned_user_id === "string"
      ? { assigned_user_id: data.assigned_user_id }
      : typeof data.assigned_to === "string"
        ? { assigned_user_id: data.assigned_to }
        : {}),
    ...(typeof data.offline_client_id === "string"
      ? { offline_client_id: data.offline_client_id }
      : {}),
    hitno_otklanjanje: data.hitno_otklanjanje === true,
  };
}
