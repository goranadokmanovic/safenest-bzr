import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import type { SupabaseClient } from "@supabase/supabase-js";

import {

  getSessionProfile,

  isAgencyStaffRole,

} from "@/lib/auth/roles";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";



/**

 * Ulogovan korisnik mora imati profiles.role = super_admin.

 */

export async function assertSuperAdminUser(): Promise<{ user: User }> {

  const session = await getSessionProfile();



  if (!session) {

    redirect("/login?next=/admin");

  }



  if (session.role !== "super_admin") {

    if (isAgencyStaffRole(session.role)) {

      redirect("/agencija");

    }

    redirect("/nemate-pristup");

  }



  return { user: session.user };

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

