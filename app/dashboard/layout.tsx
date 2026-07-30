import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAgencyStaffRole, parseAppRole } from "@/lib/auth/roles";
import { AgencyShell } from "@/components/agencija/AgencyShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return children;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = parseAppRole(profile?.role);
  const hasAgency = !!profile?.agency_id;
  const useStaffShell = isAgencyStaffRole(role) && hasAgency;

  if (!useStaffShell) {
    return children;
  }

  return (
    <AgencyShell canManageTemplates={role === "agency_owner"}>
      {children}
    </AgencyShell>
  );
}
