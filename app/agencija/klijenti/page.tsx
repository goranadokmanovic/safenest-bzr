import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { listAgencyCollaborators } from "@/lib/field-visits/list";
import { ClientForm } from "@/components/admin/ClientForm";
import { ClientsList, type ClientRow } from "@/components/admin/ClientsList";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function AgencijaKlijentiPage() {
  const { agency_id } = await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const c = m.admin.clients;

  const supabase = await createServerSupabaseClient();

  const [{ data: agency }, { data: rows, error }, collaborators] =
    await Promise.all([
      supabase.from("agencies").select("id, name").eq("id", agency_id).single(),
      supabase
        .from("client_companies")
        .select(
          "id, name, tax_id, activity_sector, address, operation_addresses, contact_email, created_at, agency_id, archived_at, assigned_collaborator_id",
        )
        .eq("agency_id", agency_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      listAgencyCollaborators(supabase, agency_id),
    ]);

  const agencyName = agency?.name ?? null;
  const agencies = agency ? [{ id: agency.id, name: agency.name }] : [];
  const collaboratorOptions = collaborators.map((w) => ({
    user_id: w.user_id,
    full_name: w.full_name,
  }));
  const nameById = new Map(
    collaboratorOptions.map((w) => [w.user_id, w.full_name]),
  );

  let clients: ClientRow[] = [];
  let loadError: string | null = error?.message ?? null;

  if (!loadError && rows) {
    clients = rows.map((row) => ({
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
      agency_name: agencyName,
      assigned_collaborator_id: row.assigned_collaborator_id,
      assigned_collaborator_name: row.assigned_collaborator_id
        ? (nameById.get(row.assigned_collaborator_id) ??
          row.assigned_collaborator_id.slice(0, 8))
        : null,
    }));
  }

  return (
    <main className="bzr-clients-page relative isolate min-h-[calc(100vh-8rem)]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <BackButton href="/dashboard" className="mb-3" />
          <h1 className="text-2xl font-bold text-ink">{c.title}</h1>
          <p className="mt-1 text-sm text-ink/70">{c.intro}</p>
        </div>
      </div>

      {loadError ? (
        <p className="relative z-10 mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loadError ? (
        <div className="relative z-10">
          <ClientForm
            agencies={agencies}
            defaultAgencyId={agency_id}
            collaborators={collaboratorOptions}
          />
          <ClientsList clients={clients} />
        </div>
      ) : null}
    </main>
  );
}
