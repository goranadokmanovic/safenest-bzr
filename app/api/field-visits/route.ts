import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import {
  canReadAgencyRecords,
  getAuthContext,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { requireClientInScope } from "@/lib/api/client-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { fieldVisitCreateSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  listFieldVisitsForAgency,
  parseFieldVisitListFilters,
} from "@/lib/field-visits/list";
import { getDelegatedFromUserIds } from "@/lib/field-visits/control-visits";
import { notifyFieldVisitAssigned } from "@/lib/field-visits/notify-assigned";

export const GET = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canReadAgencyRecords(profile) || !profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const filters = parseFieldVisitListFilters(
    new URL(request.url).searchParams,
  );
  const { rows, error } = await listFieldVisitsForAgency(
    supabase,
    profile.agency_id,
    user.id,
    filters,
  );

  if (error) {
    return jsonError(error, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ field_visits: rows, filters });
});

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = fieldVisitCreateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (!profile.agency_id && !isSuperAdmin(profile)) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const scope = await requireClientInScope(
    supabase,
    profile,
    parsed.data.client_company_id,
  );
  if (!scope.ok) return scope.response;
  const client = scope.client;

  const parentVisitId: string | null = parsed.data.parent_visit_id ?? null;
  if (parentVisitId) {
    const { data: parent } = await supabase
      .from("field_visits")
      .select("id, agency_id, assigned_user_id")
      .eq("id", parentVisitId)
      .maybeSingle();

    if (!parent || parent.agency_id !== client.agency_id) {
      return jsonError("Originalna poseta nije pronađena.", 404, {
        code: "NOT_FOUND",
      });
    }

    if (!isSuperAdmin(profile)) {
      const delegatedFrom = profile.agency_id
        ? await getDelegatedFromUserIds(supabase, profile.agency_id, user.id)
        : [];
      const allowed = new Set([user.id, ...delegatedFrom]);
      if (
        !parent.assigned_user_id ||
        !allowed.has(parent.assigned_user_id)
      ) {
        return jsonError(
          "Nemaš pravo da kreiraš kontrolnu posetu za taj nalog.",
          403,
          { code: "FORBIDDEN" },
        );
      }
    }
  }

  const row = {
    agency_id: client.agency_id,
    client_company_id: parsed.data.client_company_id,
    assigned_user_id: parsed.data.assigned_user_id ?? user.id,
    scheduled_at: parsed.data.scheduled_at ?? new Date().toISOString(),
    started_at: parsed.data.started_at ?? null,
    completed_at: parsed.data.completed_at ?? null,
    status: parsed.data.status ?? "draft",
    sync_status: parsed.data.sync_status ?? "synced",
    offline_client_id: parsed.data.offline_client_id ?? null,
    notes: parsed.data.notes ?? null,
    metadata: parsed.data.metadata ?? {},
    hitno_otklanjanje: parsed.data.hitno_otklanjanje === true,
    parent_visit_id: parentVisitId,
  };

  const { data, error } = await supabase
    .from("field_visits")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: client.agency_id,
    actor_user_id: user.id,
    action: "field_visit.created",
    entity_type: "field_visit",
    entity_id: data.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: { client_company_id: parsed.data.client_company_id },
  });

  if (audit.error) {
    console.error("[field-visits] audit log failed", audit.error);
  }

  // Ime klijenta nije u ClientScopeRow — kratki lookup za tekst notifikacije.
  let clientName = "";
  const { data: clientRow } = await supabase
    .from("client_companies")
    .select("name")
    .eq("id", parsed.data.client_company_id)
    .maybeSingle();
  clientName = (clientRow?.name as string | undefined)?.trim() ?? "";

  await notifyFieldVisitAssigned({
    agencyId: client.agency_id,
    visitId: data.id as string,
    assignedUserId: (data.assigned_user_id as string | null) ?? row.assigned_user_id,
    actorUserId: user.id,
    clientCompanyId: parsed.data.client_company_id,
    clientName,
    scheduledAt: (data.scheduled_at as string | null) ?? row.scheduled_at,
  });

  return jsonOk({ field_visit: data }, 201);
});
