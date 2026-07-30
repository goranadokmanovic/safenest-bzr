import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppRole =
  | "super_admin"
  | "agency_owner"
  | "agency_collaborator"
  | "field_worker"
  | "client_user";

export function parseAppRole(raw: string | null | undefined): AppRole | null {
  if (
    raw === "super_admin" ||
    raw === "agency_owner" ||
    raw === "agency_collaborator" ||
    raw === "field_worker" ||
    raw === "client_user"
  ) {
    return raw;
  }
  return null;
}

export function isSuperAdminRole(role: AppRole | null): boolean {
  return role === "super_admin";
}

export function isAgencyStaffRole(
  role: AppRole | null,
): role is "agency_owner" | "agency_collaborator" {
  return role === "agency_owner" || role === "agency_collaborator";
}

export type SessionProfile = {
  user: User;
  role: AppRole | null;
  agency_id: string | null;
};

/** Ulogovan korisnik + profiles.role i agency_id iz sesije. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    user,
    role: parseAppRole(profile?.role),
    agency_id: profile?.agency_id ?? null,
  };
}

/** Samo uloga iz profiles tabele (null ako nije prijavljen ili nepoznata uloga). */
export async function getSessionRole(): Promise<AppRole | null> {
  const session = await getSessionProfile();
  return session?.role ?? null;
}
