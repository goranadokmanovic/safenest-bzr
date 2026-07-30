import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { AgencyShell } from "@/components/agencija/AgencyShell";

export const dynamic = "force-dynamic";

export default async function AgencijaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await assertAgencyStaffUser();

  return (
    <AgencyShell canManageTemplates={role === "agency_owner"}>
      {children}
    </AgencyShell>
  );
}
