import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/responses";

export type AuthProfile = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  agency_id: string | null;
  client_company_id: string | null;
  locale: string;
};

export type AuthContext = {
  supabase: SupabaseClient;
  user: User;
  profile: AuthProfile;
};

export type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

export async function getAuthContext(): Promise<AuthResult> {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return {
      ok: false,
      response: jsonError("Server nema podešene Supabase promenljive.", 500, {
        code: "CONFIG_ERROR",
      }),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: jsonError("Niste prijavljeni.", 401, { code: "UNAUTHORIZED" }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "user_id, email, full_name, role, agency_id, client_company_id, locale",
    )
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false,
      response: jsonError("Profil nije pronađen.", 403, {
        code: "PROFILE_MISSING",
      }),
    };
  }

  return {
    ok: true,
    ctx: {
      supabase,
      user,
      profile: profile as AuthProfile,
    },
  };
}

export function isSuperAdmin(profile: AuthProfile): boolean {
  return profile.role === "super_admin";
}

export function isClientPortalUser(profile: AuthProfile): boolean {
  return profile.role === "client_user";
}

/** Vlasnik agencije ili saradnik — može CRUD nad klijentima/zaposlenima. */
export function canMutateAgencyRecords(profile: AuthProfile): boolean {
  if (isSuperAdmin(profile)) return true;
  return (
    profile.role === "agency_owner" || profile.role === "agency_collaborator"
  );
}

/** Terenski radnik i ostali sa agency_id — čitanje. */
export function canReadAgencyRecords(profile: AuthProfile): boolean {
  if (isSuperAdmin(profile)) return true;
  if (isClientPortalUser(profile)) return false;
  return !!profile.agency_id;
}

/** Pretplata / Stripe — samo vlasnik agencije. */
export function canManageAgencyBilling(
  profile: Pick<AuthProfile, "role" | "agency_id">,
): boolean {
  return profile.role === "agency_owner" && !!profile.agency_id;
}

/** Terenski modul — vlasnik, saradnik, terenski radnik. */
export function canMutateFieldRecords(profile: AuthProfile): boolean {
  if (isSuperAdmin(profile)) return true;
  if (isClientPortalUser(profile)) return false;
  return (
    !!profile.agency_id &&
    (profile.role === "agency_owner" ||
      profile.role === "agency_collaborator" ||
      profile.role === "field_worker")
  );
}
