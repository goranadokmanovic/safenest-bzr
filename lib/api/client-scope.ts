import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/api/responses";

/**
 * Minimalni oblik profila koji je dovoljan za opseg — namerno labav da bi ga
 * mogle koristiti i API rute (AuthProfile) i server stranice (SessionProfile).
 */
export type ClientScopeProfile = {
  user_id: string;
  role: string;
  agency_id: string | null;
};

export type ClientScopeRow = {
  id: string;
  agency_id: string;
  assigned_collaborator_id: string | null;
};

const SCOPE_SELECT = "id, agency_id, assigned_collaborator_id";

/**
 * Ogledalo `public.is_scoped_collaborator()` iz migracije
 * 20260730210000_client_collaborator_scope.sql. Samo agency_collaborator
 * podleže sužavanju; owner i field_worker vide celu agenciju.
 */
export function isScopedCollaborator(profile: ClientScopeProfile): boolean {
  return profile.role === "agency_collaborator";
}

/**
 * Lista id-jeva klijenata koje korisnik sme da vidi, ili `null` kada nema
 * sužavanja (super_admin, owner, field_worker — njima je dovoljan agency
 * filter).
 *
 * Ogledalo `public.client_company_in_scope()`: zaduženi klijenti + klijenti na
 * čijim posetama korisnik učestvuje. Isti izuzetak za učešće postoji i u RLS-u
 * kako saradnik ne bi izgubio naziv klijenta na već dodeljenim posetama.
 */
export async function clientIdsInScope(
  supabase: SupabaseClient,
  profile: ClientScopeProfile,
): Promise<
  { ok: true; clientIds: string[] | null } | { ok: false; message: string }
> {
  if (!isScopedCollaborator(profile)) {
    return { ok: true, clientIds: null };
  }
  if (!profile.agency_id) {
    return { ok: true, clientIds: [] };
  }

  const [assignedRes, primaryRes, collabRes] = await Promise.all([
    supabase
      .from("client_companies")
      .select("id")
      .eq("agency_id", profile.agency_id)
      .eq("assigned_collaborator_id", profile.user_id),
    supabase
      .from("field_visits")
      .select("client_company_id")
      .eq("agency_id", profile.agency_id)
      .eq("assigned_user_id", profile.user_id),
    supabase
      .from("field_visit_collaborators")
      .select("field_visit_id")
      .eq("user_id", profile.user_id),
  ]);

  const firstError =
    assignedRes.error ?? primaryRes.error ?? collabRes.error ?? null;
  if (firstError) {
    return { ok: false, message: firstError.message };
  }

  const ids = new Set<string>();
  for (const row of assignedRes.data ?? []) {
    if (row.id) ids.add(row.id as string);
  }
  for (const row of primaryRes.data ?? []) {
    if (row.client_company_id) ids.add(row.client_company_id as string);
  }

  const visitIds = [
    ...new Set(
      (collabRes.data ?? [])
        .map((r) => r.field_visit_id as string)
        .filter(Boolean),
    ),
  ];
  if (visitIds.length > 0) {
    const { data, error } = await supabase
      .from("field_visits")
      .select("client_company_id")
      .eq("agency_id", profile.agency_id)
      .in("id", visitIds);
    if (error) {
      return { ok: false, message: error.message };
    }
    for (const row of data ?? []) {
      if (row.client_company_id) ids.add(row.client_company_id as string);
    }
  }

  return { ok: true, clientIds: [...ids] };
}

/**
 * Primenjuje opseg na upit nad tabelom koja ima kolonu sa id-jem klijenta.
 * `clientIds === null` znači bez sužavanja.
 *
 * Bez `T extends { in(...): T }` ograničenja — takav rekurzivni constraint na
 * Supabase builder tipovima obara tsc sa TS2589.
 */
export function applyClientScope<T>(
  query: T,
  clientIds: string[] | null,
  column = "id",
): T {
  if (clientIds === null) return query;
  const filterable = query as unknown as {
    in(column: string, values: readonly string[]): T;
  };
  return filterable.in(column, clientIds);
}

export type ClientScopeCheck =
  | { ok: true; client: ClientScopeRow }
  | { ok: false; reason: "not_found" | "forbidden" | "error"; message: string };

/**
 * Provera pristupa jednom klijentu — ogledalo RLS predikata, pa daje isti
 * rezultat i pre nego što je migracija primenjena u Supabase.
 */
export async function checkClientInScope(
  supabase: SupabaseClient,
  profile: ClientScopeProfile,
  clientId: string,
): Promise<ClientScopeCheck> {
  const { data, error } = await supabase
    .from("client_companies")
    .select(SCOPE_SELECT)
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) {
    return {
      ok: false,
      reason: "not_found",
      message: "Klijent nije pronađen.",
    };
  }

  return evaluateClientScope(supabase, profile, data as ClientScopeRow);
}

/**
 * Ista provera za red koji je pozivalac već učitao — bez ponovnog čitanja
 * tabele.
 */
export async function evaluateClientScope(
  supabase: SupabaseClient,
  profile: ClientScopeProfile,
  client: ClientScopeRow,
): Promise<ClientScopeCheck> {
  if (profile.role === "super_admin") {
    return { ok: true, client };
  }
  if (!profile.agency_id || client.agency_id !== profile.agency_id) {
    return { ok: false, reason: "forbidden", message: "Nema pristupa." };
  }
  if (!isScopedCollaborator(profile)) {
    return { ok: true, client };
  }
  if (client.assigned_collaborator_id === profile.user_id) {
    return { ok: true, client };
  }

  const participates = await worksOnClient(supabase, profile, client.id);
  if (!participates.ok) {
    return { ok: false, reason: "error", message: participates.message };
  }
  if (participates.value) {
    return { ok: true, client };
  }

  return {
    ok: false,
    reason: "forbidden",
    message: "Klijent nije dodeljen vama.",
  };
}

/** Varijanta za API rute — greške vraća kao gotov JSON odgovor. */
export async function requireClientInScope(
  supabase: SupabaseClient,
  profile: ClientScopeProfile,
  clientId: string,
): Promise<
  { ok: true; client: ClientScopeRow } | { ok: false; response: NextResponse }
> {
  const result = await checkClientInScope(supabase, profile, clientId);
  if (result.ok) return result;

  if (result.reason === "not_found") {
    return {
      ok: false,
      response: jsonError(result.message, 404, { code: "NOT_FOUND" }),
    };
  }
  if (result.reason === "forbidden") {
    return {
      ok: false,
      response: jsonError(result.message, 403, { code: "FORBIDDEN" }),
    };
  }
  return {
    ok: false,
    response: jsonError(result.message, 400, { code: "DATABASE_ERROR" }),
  };
}

async function worksOnClient(
  supabase: SupabaseClient,
  profile: ClientScopeProfile,
  clientId: string,
): Promise<{ ok: true; value: boolean } | { ok: false; message: string }> {
  const { data: primary, error: primaryErr } = await supabase
    .from("field_visits")
    .select("id")
    .eq("client_company_id", clientId)
    .eq("assigned_user_id", profile.user_id)
    .limit(1);

  if (primaryErr) return { ok: false, message: primaryErr.message };
  if ((primary ?? []).length > 0) return { ok: true, value: true };

  const { data: visits, error: visitsErr } = await supabase
    .from("field_visits")
    .select("id")
    .eq("client_company_id", clientId);

  if (visitsErr) return { ok: false, message: visitsErr.message };

  const visitIds = (visits ?? []).map((v) => v.id as string).filter(Boolean);
  if (visitIds.length === 0) return { ok: true, value: false };

  const { data: collab, error: collabErr } = await supabase
    .from("field_visit_collaborators")
    .select("field_visit_id")
    .eq("user_id", profile.user_id)
    .in("field_visit_id", visitIds)
    .limit(1);

  if (collabErr) return { ok: false, message: collabErr.message };

  return { ok: true, value: (collab ?? []).length > 0 };
}
