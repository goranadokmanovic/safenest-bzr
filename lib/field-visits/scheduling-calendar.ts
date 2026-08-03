/**
 * Učitavanje poseta za kalendar Zakazivanje (dan/sedmica).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProfile } from "@/lib/api/session";
import {
  normalizeVisitType,
  type VisitType,
} from "@/lib/field-visits/visit-type";

export type CalendarVisit = {
  id: string;
  scheduled_at: string;
  client_company_id: string;
  client_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  visit_type: VisitType;
  broj_naloga: string | null;
  status: string;
};

function belgradeDayStartUtc(dayIso: string): string {
  // Approximate: treat Belgrade midnight as UTC-2/-1 padded; filter in JS by Belgrade day.
  const [y, m, d] = dayIso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0) - 14 * 3600_000).toISOString();
}

function belgradeDayEndUtc(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59) + 14 * 3600_000).toISOString();
}

function dayInBelgrade(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Shared-case klijenti za field_worker. */
async function sharedClientIdsForWorker(
  supabase: SupabaseClient,
  agencyId: string,
  userId: string,
): Promise<string[]> {
  const { data: assigned } = await supabase
    .from("field_visits")
    .select("client_company_id")
    .eq("agency_id", agencyId)
    .eq("assigned_user_id", userId)
    .limit(2000);

  const ids = new Set<string>();
  for (const row of assigned ?? []) {
    if (row.client_company_id) ids.add(row.client_company_id as string);
  }

  const { data: collab } = await supabase
    .from("field_visit_collaborators")
    .select("field_visit_id")
    .eq("user_id", userId)
    .limit(500);

  const visitIds = (collab ?? [])
    .map((r) => r.field_visit_id as string)
    .filter(Boolean);
  if (visitIds.length > 0) {
    const { data: visits } = await supabase
      .from("field_visits")
      .select("client_company_id")
      .eq("agency_id", agencyId)
      .in("id", visitIds);
    for (const row of visits ?? []) {
      if (row.client_company_id) ids.add(row.client_company_id as string);
    }
  }

  return [...ids];
}

export async function listCalendarVisits(
  supabase: SupabaseClient,
  input: {
    agencyId: string;
    profile: AuthProfile;
    userId: string;
    /** YYYY-MM-DD inclusive (Belgrade) */
    fromDay: string;
    /** YYYY-MM-DD inclusive (Belgrade) */
    toDay: string;
  },
): Promise<{ rows: CalendarVisit[]; error: string | null }> {
  const from = belgradeDayStartUtc(input.fromDay);
  const to = belgradeDayEndUtc(input.toDay);

  let query = supabase
    .from("field_visits")
    .select(
      "id, scheduled_at, client_company_id, assigned_user_id, visit_type, broj_naloga, status, client_companies ( name )",
    )
    .eq("agency_id", input.agencyId)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("status", "eq", "cancelled")
    .order("scheduled_at", { ascending: true })
    .limit(800);

  if (input.profile.role === "field_worker") {
    const sharedClients = await sharedClientIdsForWorker(
      supabase,
      input.agencyId,
      input.userId,
    );
    if (sharedClients.length === 0) {
      query = query.eq("assigned_user_id", input.userId);
    } else {
      // Own visits OR any visit on shared clients
      query = query.or(
        `assigned_user_id.eq.${input.userId},client_company_id.in.(${sharedClients.join(",")})`,
      );
    }
  }
  // owner + collaborator: sve posete agencije (bez dodatnog filtera)

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rowsRaw = data ?? [];
  const userIds = [
    ...new Set(
      rowsRaw
        .map((r) => r.assigned_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      names.set(
        p.user_id as string,
        (p.full_name as string | null)?.trim() ||
          (p.email as string | null) ||
          (p.user_id as string).slice(0, 8),
      );
    }
  }

  const rows: CalendarVisit[] = [];
  for (const row of rowsRaw) {
    const scheduled = String(row.scheduled_at ?? "");
    if (!scheduled) continue;
    const day = dayInBelgrade(scheduled);
    if (day < input.fromDay || day > input.toDay) continue;

    const cc = row.client_companies as
      | { name?: string }
      | { name?: string }[]
      | null;
    const clientName = Array.isArray(cc)
      ? (cc[0]?.name ?? null)
      : (cc?.name ?? null);

    rows.push({
      id: String(row.id),
      scheduled_at: scheduled,
      client_company_id: String(row.client_company_id),
      client_name: clientName,
      assigned_user_id: (row.assigned_user_id as string | null) ?? null,
      assigned_user_name: row.assigned_user_id
        ? (names.get(row.assigned_user_id as string) ?? null)
        : null,
      visit_type: normalizeVisitType(row.visit_type),
      broj_naloga: (row.broj_naloga as string | null) ?? null,
      status: String(row.status ?? ""),
    });
  }

  return { rows, error: null };
}

export function addDaysIso(dayIso: string, delta: number): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const ms = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + delta * 86400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function startOfWeekMonday(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  // getUTCDay: 0=Sun … convert to Monday=0
  const dow = (utc.getUTCDay() + 6) % 7;
  return addDaysIso(dayIso, -dow);
}

export function startOfMonth(dayIso: string): string {
  return `${dayIso.slice(0, 7)}-01`;
}

export function endOfMonth(dayIso: string): string {
  const [y, m] = dayIso.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Pun Mon–Sun grid oko meseca (trailing / leading dani). */
export function monthGridRange(anchorDayIso: string): {
  from: string;
  to: string;
  monthStart: string;
  monthEnd: string;
} {
  const monthStart = startOfMonth(anchorDayIso);
  const monthEnd = endOfMonth(anchorDayIso);
  return {
    from: startOfWeekMonday(monthStart),
    to: addDaysIso(startOfWeekMonday(monthEnd), 6),
    monthStart,
    monthEnd,
  };
}

/** Pomeraj mesec; dan se klampuje na poslednji dan ciljnog meseca. */
export function addMonthsIso(dayIso: string, delta: number): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const total = (y ?? 2026) * 12 + ((m ?? 1) - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const day = Math.min(d ?? 1, last);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayBelgradeDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type CalendarViewMode = "day" | "week" | "month";

export function resolveCalendarRange(
  view: CalendarViewMode,
  anchor: string,
): { from: string; to: string } {
  if (view === "day") {
    return { from: anchor, to: anchor };
  }
  if (view === "month") {
    const { from, to } = monthGridRange(anchor);
    return { from, to };
  }
  const from = startOfWeekMonday(anchor);
  return { from, to: addDaysIso(from, 6) };
}
