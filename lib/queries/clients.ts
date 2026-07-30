/**
 * Deljene read funkcije nad klijentima. Koriste ih i API rute i AI asistent.
 * Uvek primaju `supabase` klijent pozivaoca (RLS) i već izračunat opseg
 * (`clientIds` iz lib/api/client-scope.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyClientScope } from "@/lib/api/client-scope";
import {
  getComplianceStatus,
  todayBelgradeIso,
  type ComplianceStatusKind,
} from "@/lib/compliance/types";

export type ScopedClient = {
  id: string;
  name: string;
};

export type ClientLookup =
  | { kind: "one"; client: ScopedClient }
  | { kind: "many"; candidates: ScopedClient[] }
  | { kind: "none" };

export type QueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function sanitizeIlike(raw: string): string {
  return raw.replace(/%/g, "").replace(/,/g, "").trim();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Svi klijenti u opsegu korisnika — id + naziv, za dropdown i za asistenta. */
export async function listScopedClients(
  supabase: SupabaseClient,
  agencyId: string,
  clientIds: string[] | null,
  limit = 500,
): Promise<QueryResult<ScopedClient[]>> {
  const { data, error } = await applyClientScope(
    supabase
      .from("client_companies")
      .select("id, name")
      .eq("agency_id", agencyId)
      .is("archived_at", null)
      .order("name", { ascending: true })
      .limit(limit),
    clientIds,
  );

  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    value: (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
  };
}

/**
 * Pronalazi klijenta po nazivu koji je korisnik izgovorio. Asistent nikad ne
 * barata UUID-jevima — model šalje tekst, a razrešavanje ide ovde, unutar
 * opsega korisnika.
 */
export async function lookupClientByName(
  supabase: SupabaseClient,
  agencyId: string,
  clientIds: string[] | null,
  rawName: string,
): Promise<QueryResult<ClientLookup>> {
  const needle = sanitizeIlike(rawName);
  if (needle.length < 2) {
    return { ok: true, value: { kind: "none" } };
  }

  const { data, error } = await applyClientScope(
    supabase
      .from("client_companies")
      .select("id, name, legal_name")
      .eq("agency_id", agencyId)
      .is("archived_at", null)
      .or(`name.ilike.%${needle}%,legal_name.ilike.%${needle}%`)
      .order("name", { ascending: true })
      .limit(10),
    clientIds,
  );

  if (error) return { ok: false, message: error.message };

  const rows = (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  if (rows.length === 0) return { ok: true, value: { kind: "none" } };
  if (rows.length === 1) return { ok: true, value: { kind: "one", client: rows[0]! } };

  // Više pogodaka po podnizu, ali tačno jedan tačan naziv — uzmi taj.
  const exact = rows.filter((r) => normalize(r.name) === normalize(rawName));
  if (exact.length === 1) {
    return { ok: true, value: { kind: "one", client: exact[0]! } };
  }

  return { ok: true, value: { kind: "many", candidates: rows } };
}

export type ClientSummary = {
  client_id: string;
  client_name: string;
  activity_sector: string | null;
  assigned_collaborator_name: string | null;
  employees_total: number;
  employees_active: number;
  visits_total: number;
  visits_last_90_days: number;
  last_visit_at: string | null;
  compliance_total: number;
  compliance_expired: number;
  compliance_expiring_30d: number;
  compliance_missing_expiry: number;
};

/** Pregled jednog klijenta — brojači radnika, poseta i statusa rokova. */
export async function getClientSummary(
  supabase: SupabaseClient,
  client: ScopedClient,
  todayIso: string = todayBelgradeIso(),
): Promise<QueryResult<ClientSummary>> {
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    clientRes,
    employeesRes,
    visitsTotalRes,
    visits90Res,
    lastVisitRes,
    complianceRes,
  ] = await Promise.all([
    supabase
      .from("client_companies")
      .select("id, name, activity_sector, assigned_collaborator_id")
      .eq("id", client.id)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, active")
      .eq("client_company_id", client.id)
      .limit(2000),
    supabase
      .from("field_visits")
      .select("id", { count: "exact", head: true })
      .eq("client_company_id", client.id),
    supabase
      .from("field_visits")
      .select("id", { count: "exact", head: true })
      .eq("client_company_id", client.id)
      .gte("scheduled_at", since90),
    supabase
      .from("field_visits")
      .select("scheduled_at")
      .eq("client_company_id", client.id)
      .order("scheduled_at", { ascending: false })
      .limit(1),
    supabase
      .from("compliance_records")
      .select("id, expiry_date")
      .eq("client_company_id", client.id)
      .limit(2000),
  ]);

  const firstError =
    clientRes.error ??
    employeesRes.error ??
    visitsTotalRes.error ??
    visits90Res.error ??
    lastVisitRes.error ??
    complianceRes.error ??
    null;
  if (firstError) return { ok: false, message: firstError.message };
  if (!clientRes.data) {
    return { ok: false, message: "Klijent nije pronađen." };
  }

  let assignedName: string | null = null;
  const assignedId = clientRes.data.assigned_collaborator_id as string | null;
  if (assignedId) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", assignedId)
      .maybeSingle();
    assignedName =
      assignee?.full_name?.trim() || assignee?.email || assignedId.slice(0, 8);
  }

  const employees = employeesRes.data ?? [];
  const counts: Record<ComplianceStatusKind, number> = {
    missing: 0,
    expired: 0,
    expiring: 0,
    valid: 0,
  };
  for (const record of complianceRes.data ?? []) {
    const status = getComplianceStatus(
      record.expiry_date as string | null,
      todayIso,
    );
    counts[status.kind] += 1;
  }

  return {
    ok: true,
    value: {
      client_id: clientRes.data.id as string,
      client_name: clientRes.data.name as string,
      activity_sector: (clientRes.data.activity_sector as string | null) ?? null,
      assigned_collaborator_name: assignedName,
      employees_total: employees.length,
      employees_active: employees.filter((e) => e.active !== false).length,
      visits_total: visitsTotalRes.count ?? 0,
      visits_last_90_days: visits90Res.count ?? 0,
      last_visit_at:
        (lastVisitRes.data?.[0]?.scheduled_at as string | undefined) ?? null,
      compliance_total: (complianceRes.data ?? []).length,
      compliance_expired: counts.expired,
      compliance_expiring_30d: counts.expiring,
      compliance_missing_expiry: counts.missing,
    },
  };
}
