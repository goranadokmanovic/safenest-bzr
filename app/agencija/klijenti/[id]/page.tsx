import { Suspense } from "react";
import { notFound } from "next/navigation";
import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listAgencyCollaborators } from "@/lib/field-visits/list";
import { checkClientInScope } from "@/lib/api/client-scope";
import { isUuid } from "@/lib/api/agency-scope";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";
import {
  ClientDetailView,
  type ClientDetailTab,
} from "@/components/admin/ClientDetailView";
import type { ClientRow } from "@/components/admin/ClientsList";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function parseTab(raw: string | undefined): ClientDetailTab {
  if (raw === "radnici" || raw === "rokovi" || raw === "osnovni") return raw;
  return "osnovni";
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: Params) {
  const { agency_id, user, role } = await assertAgencyStaffUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();

  const scope = await checkClientInScope(
    supabase,
    { user_id: user.id, role, agency_id },
    id,
  );
  if (!scope.ok) notFound();

  const [{ data: agency }, { data: row, error }, collaborators] =
    await Promise.all([
      supabase.from("agencies").select("id, name").eq("id", agency_id).single(),
      supabase
        .from("client_companies")
        .select(
          "id, name, tax_id, activity_sector, address, operation_addresses, contact_email, created_at, agency_id, archived_at, assigned_collaborator_id",
        )
        .eq("id", id)
        .eq("agency_id", agency_id)
        .is("archived_at", null)
        .maybeSingle(),
      listAgencyCollaborators(supabase, agency_id),
    ]);

  if (error || !row) notFound();

  const collaboratorOptions = collaborators.map((w) => ({
    user_id: w.user_id,
    full_name: w.full_name,
  }));
  const nameById = new Map(
    collaboratorOptions.map((w) => [w.user_id, w.full_name]),
  );

  const client: ClientRow = {
    id: row.id,
    name: row.name,
    tax_id: row.tax_id,
    activity_sector: row.activity_sector,
    address: row.address,
    operation_addresses: Array.isArray(row.operation_addresses)
      ? (row.operation_addresses as string[])
      : [],
    contact_email: row.contact_email,
    created_at: row.created_at,
    agency_id: row.agency_id,
    agency_name: agency?.name ?? null,
    assigned_collaborator_id: row.assigned_collaborator_id,
    assigned_collaborator_name: row.assigned_collaborator_id
      ? (nameById.get(row.assigned_collaborator_id) ??
        row.assigned_collaborator_id.slice(0, 8))
      : null,
  };

  return (
    <main className="bzr-clients-page relative isolate min-h-[calc(100vh-8rem)]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative z-10">
        <BackButton href="/agencija/klijenti" className="mb-3" />
        <Suspense fallback={null}>
          <ClientDetailView
            client={client}
            collaborators={collaboratorOptions}
            initialTab={parseTab(sp.tab)}
          />
        </Suspense>
      </div>
    </main>
  );
}
