import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { employeeBulkCreateSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

async function loadClientAgency(supabase: SupabaseClient, clientId: string) {
  return supabase
    .from("client_companies")
    .select("id, agency_id")
    .eq("id", clientId)
    .maybeSingle();
}

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

  const { id: clientId } = await params;
  if (!isUuid(clientId)) {
    return jsonError("Nevažeći id klijenta.", 400, { code: "INVALID_ID" });
  }

  const { data: client, error: cErr } = await loadClientAgency(
    supabase,
    clientId,
  );
  if (cErr || !client) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    client.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("client_company_id", clientId)
    .order("last_name", { ascending: true });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ employees: data ?? [] });
});

export const POST = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const { id: clientId } = await params;
  if (!isUuid(clientId)) {
    return jsonError("Nevažeći id klijenta.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = employeeBulkCreateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }
  const isBulk = Array.isArray(raw.value) || !!(raw.value as { employees?: unknown })?.employees;

  const { data: client, error: cErr } = await loadClientAgency(
    supabase,
    clientId,
  );
  if (cErr || !client) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    client.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const rows = parsed.data.map((employee) => ({
    agency_id: client.agency_id,
    client_company_id: clientId,
    first_name: employee.first_name.trim(),
    last_name: employee.last_name.trim(),
    position: employee.position?.trim() || null,
    personal_id_masked: employee.personal_id_masked?.trim() || null,
    employment_start: employee.employment_start ?? null,
    active: employee.active ?? true,
  }));

  const { data, error } = await supabase
    .from("employees")
    .insert(rows)
    .select("*");

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const created = data ?? [];

  return jsonOk(
    isBulk
      ? { employees: created, created: created.length }
      : { employee: created[0] ?? null },
    201,
  );
});
