/**
 * Deljene funkcije nad članovima agencije.
 *
 * Izvor istine za "ko je član agencije" je `profiles.agency_id`, ne
 * `agency_members`. Razlog: super admin PATCH nad profilom menja `profiles`, a
 * `agency_members` red ostaje kod stare agencije, pa bi lista vezana samo za
 * `agency_members` prikazala čoveka u pogrešnoj agenciji. `agency_members`
 * koristimo za metapodatke (kada se pridružio, ko ga je pozvao).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Uloge koje se prikazuju kao radnici agencije (bez client_user). */
export const AGENCY_STAFF_ROLES = [
  "agency_owner",
  "agency_collaborator",
  "field_worker",
] as const;

export type AgencyStaffRole = (typeof AGENCY_STAFF_ROLES)[number];

/** profiles.role → agency_members.member_role */
export const MEMBER_ROLE_BY_PROFILE_ROLE: Record<AgencyStaffRole, string> = {
  agency_owner: "owner",
  agency_collaborator: "collaborator",
  field_worker: "field_worker",
};

export function isAgencyStaffRole(role: string): role is AgencyStaffRole {
  return (AGENCY_STAFF_ROLES as readonly string[]).includes(role);
}

export type AgencyMember = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  joined_at: string | null;
  invited_at: string | null;
  invited_by: string | null;
};

export type QueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type MembershipMeta = {
  joined_at: string | null;
  invited_at: string | null;
  invited_by: string | null;
};

/**
 * Svi radnici agencije, sortirani po imenu. Vlasnici idu prvi da lista počne
 * od onoga ko upravlja agencijom.
 */
export async function listAgencyMembers(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<QueryResult<AgencyMember[]>> {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, email, full_name, role")
    .eq("agency_id", agencyId)
    .in("role", [...AGENCY_STAFF_ROLES]);

  if (profilesError) {
    return { ok: false, message: profilesError.message };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("agency_members")
    .select("user_id, joined_at, invited_at, invited_by")
    .eq("agency_id", agencyId);

  if (membershipsError) {
    return { ok: false, message: membershipsError.message };
  }

  const metaByUser = new Map<string, MembershipMeta>();
  for (const row of memberships ?? []) {
    metaByUser.set(row.user_id as string, {
      joined_at: (row.joined_at as string | null) ?? null,
      invited_at: (row.invited_at as string | null) ?? null,
      invited_by: (row.invited_by as string | null) ?? null,
    });
  }

  const members: AgencyMember[] = (profiles ?? []).map((p) => {
    const meta = metaByUser.get(p.user_id as string);
    return {
      user_id: p.user_id as string,
      email: (p.email as string | null) ?? "",
      full_name: (p.full_name as string | null)?.trim() || "",
      role: p.role as string,
      joined_at: meta?.joined_at ?? null,
      invited_at: meta?.invited_at ?? null,
      invited_by: meta?.invited_by ?? null,
    };
  });

  members.sort((a, b) => {
    if (a.role !== b.role) {
      if (a.role === "agency_owner") return -1;
      if (b.role === "agency_owner") return 1;
    }
    const an = a.full_name || a.email;
    const bn = b.full_name || b.email;
    return an.localeCompare(bn, "sr");
  });

  return { ok: true, value: members };
}

/**
 * Poravnava `agency_members` sa profilom nakon što se promeni `profiles.role`
 * ili `profiles.agency_id`. Bez ovoga red ostaje kod stare agencije, pa se
 * korisnik pojavljuje u listi pogrešne agencije. Zahteva service role klijent
 * jer authenticated nema write grant nad `profiles`.
 */
export async function syncAgencyMembership(
  admin: SupabaseClient,
  userId: string,
  agencyId: string | null,
  role: string,
): Promise<QueryResult<null>> {
  if (!agencyId || !isAgencyStaffRole(role)) {
    const { error } = await admin
      .from("agency_members")
      .delete()
      .eq("user_id", userId);
    return error ? { ok: false, message: error.message } : { ok: true, value: null };
  }

  const { error: staleError } = await admin
    .from("agency_members")
    .delete()
    .eq("user_id", userId)
    .neq("agency_id", agencyId);

  if (staleError) {
    return { ok: false, message: staleError.message };
  }

  const memberRole = MEMBER_ROLE_BY_PROFILE_ROLE[role];

  const { data: existing, error: readError } = await admin
    .from("agency_members")
    .select("id")
    .eq("user_id", userId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: readError.message };
  }

  if (existing) {
    const { error } = await admin
      .from("agency_members")
      .update({ member_role: memberRole })
      .eq("id", existing.id);
    return error ? { ok: false, message: error.message } : { ok: true, value: null };
  }

  const { error } = await admin.from("agency_members").insert({
    agency_id: agencyId,
    user_id: userId,
    member_role: memberRole,
    joined_at: new Date().toISOString(),
  });

  return error ? { ok: false, message: error.message } : { ok: true, value: null };
}

/** Broj vlasnika u agenciji — čuva od uklanjanja poslednjeg vlasnika. */
export async function countAgencyOwners(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<QueryResult<number>> {
  const { count, error } = await supabase
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("role", "agency_owner");

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, value: count ?? 0 };
}
