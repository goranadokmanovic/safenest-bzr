import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Ulogovan korisnik mora imati profiles.role = super_admin.
 */
export async function assertSuperAdminUser(): Promise<{ user: User }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  return { user };
}

export type AdminDbContext = {
  admin: SupabaseClient;
};

/**
 * Service role za čitanje svih agencija/profila. Bez njega admin liste ne rade.
 */
export function getAdminDbOrNull(): AdminDbContext | null {
  try {
    return { admin: createAdminSupabaseClient() };
  } catch {
    return null;
  }
}
