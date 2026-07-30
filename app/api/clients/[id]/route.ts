import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
} from "@/lib/api/session";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { clientPatchSchema, normalizeOperationAddresses } from "@/lib/api/schemas";
import { resolveAssignedCollaboratorId } from "@/lib/api/client-assigned-collaborator";
import {
  evaluateClientScope,
  isScopedCollaborator,
  requireClientInScope,
  type ClientScopeRow,
} from "@/lib/api/client-scope";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiCatch(async (_request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canReadAgencyRecords(profile)) {
    return jsonError("Nemate pristup.", 403, { code: "FORBIDDEN" });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data, error } = await supabase
    .from("client_companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const scope = await evaluateClientScope(
    supabase,
    profile,
    data as ClientScopeRow,
  );
  if (!scope.ok) {
    return jsonError(scope.message, scope.reason === "error" ? 400 : 403, {
      code: scope.reason === "error" ? "DATABASE_ERROR" : "FORBIDDEN",
    });
  }

  return jsonOk({ client: data });
});

export const PATCH = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = clientPatchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const scope = await requireClientInScope(supabase, profile, id);
  if (!scope.ok) return scope.response;
  const existing = scope.client;

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.contact_email === "") {
    patch.contact_email = null;
  }
  if (parsed.data.operation_addresses !== undefined) {
    patch.operation_addresses = normalizeOperationAddresses(
      parsed.data.operation_addresses,
    );
  }
  delete patch.agency_id;

  if ("assigned_collaborator_id" in parsed.data) {
    // Prebacivanje klijenta na drugog saradnika izbacilo bi red iz opsega
    // pošiljaoca; isto blokira i client_companies_update WITH CHECK.
    if (
      isScopedCollaborator(profile) &&
      parsed.data.assigned_collaborator_id !== profile.user_id
    ) {
      return jsonError(
        "Zaduženog saradnika može da menja samo vlasnik agencije.",
        403,
        { code: "FORBIDDEN" },
      );
    }

    const assigned = await resolveAssignedCollaboratorId(
      supabase,
      existing.agency_id,
      parsed.data.assigned_collaborator_id,
    );
    if (!assigned.ok) return assigned.response;
    if (assigned.skip) {
      delete patch.assigned_collaborator_id;
    } else {
      patch.assigned_collaborator_id = assigned.value;
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("Nema polja za ažuriranje.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data, error } = await supabase
    .from("client_companies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ client: data });
});

export const DELETE = withApiCatch(async (_request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const scope = await requireClientInScope(supabase, profile, id);
  if (!scope.ok) return scope.response;

  const { data, error } = await supabase
    .from("client_companies")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ client: data });
});
