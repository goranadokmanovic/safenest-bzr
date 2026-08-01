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

export type ScopedClientWithStats = {
  id: string;
  name: string;
  /** true = assigned_collaborator_id je trenutni korisnik. */
  is_assigned: boolean;
  employees_active: number;
  compliance_expired: number;
  compliance_expiring_30d: number;
};

export type ScopedClientsWithStatsResult = {
  /**
   * `agency` = owner / bez sužavanja.
   * `assigned_and_visits` = saradnik: dodeljeni + klijenti sa poseta.
   */
  scope: "agency" | "assigned_and_visits";
  /** Broj klijenata u opsegu (posle opcione pretrage po imenu). */
  count: number;
  /** Strogo assigned_collaborator_id — za pitanje „za koliko sam zadužen”. */
  assigned_count: number;
  /** U opsegu preko poseta, ali bez dodele. */
  visit_only_count: number;
  truncated: boolean;
  clients: ScopedClientWithStats[];
  /** Napomena modelu kad assigned_count < count. */
  hint: string | null;
};

export type ListScopedClientsWithStatsInput = {
  agencyId: string;
  /** Opseg iz clientIdsInScope; null = cela agencija. */
  clientIds: string[] | null;
  /** user_id pozivaoca — za is_assigned / assigned_count. */
  userId: string;
  clientName?: string | null;
  todayIso?: string;
  limit?: number;
};

/**
 * Lista klijenata u opsegu sa laganim statistikama (aktivni radnici, rokovi).
 * Batch upiti — bez N× getClientSummary.
 */
export async function listScopedClientsWithStats(
  supabase: SupabaseClient,
  input: ListScopedClientsWithStatsInput,
): Promise<QueryResult<ScopedClientsWithStatsResult>> {
  const limit = input.limit ?? 100;
  const todayIso = input.todayIso ?? todayBelgradeIso();
  const scope: ScopedClientsWithStatsResult["scope"] =
    input.clientIds === null ? "agency" : "assigned_and_visits";

  const needle = input.clientName ? sanitizeIlike(input.clientName) : "";

  let query = supabase
    .from("client_companies")
    .select("id, name, assigned_collaborator_id")
    .eq("agency_id", input.agencyId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(limit + 1);

  if (needle.length >= 2) {
    query = query.or(`name.ilike.%${needle}%,legal_name.ilike.%${needle}%`);
  }

  const { data, error } = await applyClientScope(query, input.clientIds);
  if (error) return { ok: false, message: error.message };

  const rows = data ?? [];
  const truncated = rows.length > limit;
  const page = rows.slice(0, limit);

  if (page.length === 0) {
    return {
      ok: true,
      value: {
        scope,
        count: 0,
        assigned_count: 0,
        visit_only_count: 0,
        truncated: false,
        clients: [],
        hint: null,
      },
    };
  }

  const ids = page.map((c) => c.id as string);

  const [employeesRes, complianceRes] = await Promise.all([
    supabase
      .from("employees")
      .select("client_company_id, active")
      .in("client_company_id", ids)
      .limit(5000),
    supabase
      .from("compliance_records")
      .select("client_company_id, expiry_date")
      .in("client_company_id", ids)
      .limit(5000),
  ]);

  if (employeesRes.error) {
    return { ok: false, message: employeesRes.error.message };
  }
  if (complianceRes.error) {
    return { ok: false, message: complianceRes.error.message };
  }

  const activeByClient = new Map<string, number>();
  for (const row of employeesRes.data ?? []) {
    if (row.active === false) continue;
    const cid = row.client_company_id as string;
    activeByClient.set(cid, (activeByClient.get(cid) ?? 0) + 1);
  }

  const expiredByClient = new Map<string, number>();
  const expiringByClient = new Map<string, number>();
  for (const row of complianceRes.data ?? []) {
    const cid = row.client_company_id as string;
    const status = getComplianceStatus(
      row.expiry_date as string | null,
      todayIso,
    );
    if (status.kind === "expired") {
      expiredByClient.set(cid, (expiredByClient.get(cid) ?? 0) + 1);
    } else if (status.kind === "expiring") {
      expiringByClient.set(cid, (expiringByClient.get(cid) ?? 0) + 1);
    }
  }

  const clients: ScopedClientWithStats[] = page.map((c) => {
    const id = c.id as string;
    const isAssigned = c.assigned_collaborator_id === input.userId;
    return {
      id,
      name: c.name as string,
      is_assigned: isAssigned,
      employees_active: activeByClient.get(id) ?? 0,
      compliance_expired: expiredByClient.get(id) ?? 0,
      compliance_expiring_30d: expiringByClient.get(id) ?? 0,
    };
  });

  const assigned_count = clients.filter((c) => c.is_assigned).length;
  const visit_only_count = clients.filter((c) => !c.is_assigned).length;

  let hint: string | null = null;
  if (scope === "assigned_and_visits" && visit_only_count > 0) {
    hint =
      "Za pitanje „za koliko klijenata sam zadužen” koristi assigned_count (stroga dodela). count uključuje i klijente vidljive preko poseta (visit_only_count) — pomeni ih samo ako je relevantno, ne mešaj sa „zadužen”.";
  } else if (scope === "agency") {
    hint =
      "Korisnik vidi celu agenciju — za „koliko klijenata imam” koristi count. assigned_count je broj klijenata gde je on assigned_collaborator_id (obično 0 za vlasnika).";
  }

  return {
    ok: true,
    value: {
      scope,
      count: clients.length,
      assigned_count,
      visit_only_count,
      truncated,
      clients,
      hint,
    },
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

/**
 * Postoji li klijent tog naziva u agenciji korisnika, bez obzira na njegov
 * opseg. Ide kroz SECURITY DEFINER RPC koji vraća samo boolean — poziva se
 * isključivo da bismo razlikovali „nema ga u agenciji” od „postoji, ali nije
 * dodeljen tebi”. Pri grešci vraća false, pa poruka ostaje ona blaža.
 */
export async function clientExistsInAgency(
  supabase: SupabaseClient,
  rawName: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("client_exists_in_agency", {
    p_name: rawName,
  });

  if (error) {
    console.error("[clients] client_exists_in_agency failed", error.message);
    return false;
  }
  return data === true;
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
