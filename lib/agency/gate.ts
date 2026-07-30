import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  getSessionProfile,
  isAgencyStaffRole,
  isSuperAdminRole,
} from "@/lib/auth/roles";

/**
 * Vlasnik agencije ili saradnik sa dodeljenom agencijom.
 * super_admin se preusmerava na /admin.
 */
export async function assertAgencyStaffUser(): Promise<{
  user: User;
  agency_id: string;
  role: "agency_owner" | "agency_collaborator";
}> {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/agencija");
  }

  if (isSuperAdminRole(session.role)) {
    redirect("/admin");
  }

  if (!isAgencyStaffRole(session.role) || !session.agency_id) {
    redirect("/nemate-pristup");
  }

  return {
    user: session.user,
    agency_id: session.agency_id,
    role: session.role,
  };
}
