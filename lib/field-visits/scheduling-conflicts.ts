/**
 * Provera konflikata pri zakazivanju — jedan izvor za API, formu i Zrnu.
 *
 * 1) Isti radnik — preklapanje intervala [start, start+duration)
 * 2) Isti klijent — bilo koja poseta istog kalendarskog dana (Belgrade)
 *
 * Ignoriše cancelled i completed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayBelgradeIso } from "@/lib/compliance/types";

export const DEFAULT_VISIT_DURATION_HOURS = 1;

export type SchedulingConflictVisit = {
  id: string;
  broj_naloga: string | null;
  scheduled_at: string;
  client_company_id: string;
  client_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  duration_hours: number;
  kind: "worker_overlap" | "client_same_day";
};

export type SchedulingConflictsResult = {
  worker_overlaps: SchedulingConflictVisit[];
  client_same_day: SchedulingConflictVisit[];
  has_conflicts: boolean;
};

export type FindSchedulingConflictsInput = {
  agencyId: string;
  clientCompanyId: string;
  assignedUserId: string | null | undefined;
  scheduledAt: string;
  durationHours?: number | null;
  excludeVisitId?: string | null;
};

function belgradeDayIso(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Belgrade",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return todayBelgradeIso();
  }
}

/** Širi prozor oko dana da pokrije UTC offset. */
function paddedDayWindow(dayIso: string): { from: string; to: string } {
  const [y, m, d] = dayIso.split("-").map(Number);
  const mid = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  return {
    from: new Date(mid - 14 * 3600_000).toISOString(),
    to: new Date(mid + 38 * 3600_000).toISOString(),
  };
}

function resolveDurationHours(value: number | null | undefined): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 24
  ) {
    return value;
  }
  return DEFAULT_VISIT_DURATION_HOURS;
}

function durationFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return DEFAULT_VISIT_DURATION_HOURS;
  }
  const raw = (metadata as { duration_hours?: unknown }).duration_hours;
  return resolveDurationHours(
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : null,
  );
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function findSchedulingConflicts(
  supabase: SupabaseClient,
  input: FindSchedulingConflictsInput,
): Promise<SchedulingConflictsResult> {
  const empty: SchedulingConflictsResult = {
    worker_overlaps: [],
    client_same_day: [],
    has_conflicts: false,
  };

  const startMs = Date.parse(input.scheduledAt);
  if (!Number.isFinite(startMs)) return empty;

  const durationHours = resolveDurationHours(input.durationHours);
  const endMs = startMs + durationHours * 3600_000;
  const dayIso = belgradeDayIso(input.scheduledAt);
  const window = paddedDayWindow(dayIso);

  // Širi prozor za worker overlap: ±24h oko početka (dovoljno za trajanje do 24h).
  const workerFrom = new Date(startMs - 24 * 3600_000).toISOString();
  const workerTo = new Date(endMs + 24 * 3600_000).toISOString();

  type Row = {
    id: string;
    broj_naloga: string | null;
    scheduled_at: string;
    client_company_id: string;
    assigned_user_id: string | null;
    status: string | null;
    metadata: unknown;
    client_companies: { name?: string } | { name?: string }[] | null;
  };

  const selectCols =
    "id, broj_naloga, scheduled_at, client_company_id, assigned_user_id, status, metadata, client_companies ( name )";

  const workerPromise =
    input.assignedUserId
      ? supabase
          .from("field_visits")
          .select(selectCols)
          .eq("agency_id", input.agencyId)
          .eq("assigned_user_id", input.assignedUserId)
          .gte("scheduled_at", workerFrom)
          .lte("scheduled_at", workerTo)
          .not("status", "in", "(cancelled,completed)")
          .limit(100)
      : Promise.resolve({ data: [] as Row[], error: null });

  const clientPromise = supabase
    .from("field_visits")
    .select(selectCols)
    .eq("agency_id", input.agencyId)
    .eq("client_company_id", input.clientCompanyId)
    .gte("scheduled_at", window.from)
    .lte("scheduled_at", window.to)
    .not("status", "in", "(cancelled,completed)")
    .limit(100);

  const [workerRes, clientRes] = await Promise.all([
    workerPromise,
    clientPromise,
  ]);

  if (workerRes.error || clientRes.error) {
    return empty;
  }

  const workerRows = (workerRes.data ?? []) as unknown as Row[];
  const clientRows = (clientRes.data ?? []) as unknown as Row[];

  const assigneeIds = [
    ...new Set(
      [...workerRows, ...clientRows]
        .map((r) => r.assigned_user_id)
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

  function clientName(row: Row): string | null {
    const cc = row.client_companies;
    if (Array.isArray(cc)) return cc[0]?.name?.trim() || null;
    return cc?.name?.trim() || null;
  }

  function toConflict(
    row: Row,
    kind: SchedulingConflictVisit["kind"],
  ): SchedulingConflictVisit {
    return {
      id: row.id,
      broj_naloga: row.broj_naloga,
      scheduled_at: row.scheduled_at,
      client_company_id: row.client_company_id,
      client_name: clientName(row),
      assigned_user_id: row.assigned_user_id,
      assigned_user_name: row.assigned_user_id
        ? (names.get(row.assigned_user_id) ?? null)
        : null,
      duration_hours: durationFromMetadata(row.metadata),
      kind,
    };
  }

  const worker_overlaps: SchedulingConflictVisit[] = [];
  for (const row of workerRows) {
    if (input.excludeVisitId && row.id === input.excludeVisitId) continue;
    const otherStart = Date.parse(row.scheduled_at);
    if (!Number.isFinite(otherStart)) continue;
    const otherEnd =
      otherStart + durationFromMetadata(row.metadata) * 3600_000;
    if (intervalsOverlap(startMs, endMs, otherStart, otherEnd)) {
      worker_overlaps.push(toConflict(row, "worker_overlap"));
    }
  }

  const client_same_day: SchedulingConflictVisit[] = [];
  const seenClient = new Set<string>();
  for (const row of clientRows) {
    if (input.excludeVisitId && row.id === input.excludeVisitId) continue;
    if (belgradeDayIso(row.scheduled_at) !== dayIso) continue;
    if (seenClient.has(row.id)) continue;
    seenClient.add(row.id);
    client_same_day.push(toConflict(row, "client_same_day"));
  }

  // Ako ista poseta ulazi i kao worker i kao client, zadrži oba kind-a odvojeno
  // (korisnik vidi oba razloga). Nemoj dedupe-ovati preko kind-a.
  return {
    worker_overlaps,
    client_same_day,
    has_conflicts:
      worker_overlaps.length > 0 || client_same_day.length > 0,
  };
}
