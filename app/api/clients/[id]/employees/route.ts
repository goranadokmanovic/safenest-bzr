import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthContext,
  canReadAgencyRecords,
  canMutateAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { employeeCreateSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: { id: string } };

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

  const clientId = params.id;
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
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canMutateAgencyRecords(profile)) {
    return jsonError("Nemate dozvolu za izmenu.", 403, { code: "FORBIDDEN" });
  }

  const clientId = params.id;
  if (!isUuid(clientId)) {
    return jsonError("Nevažeći id klijenta.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = employeeCreateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
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

  const row = {
    agency_id: client.agency_id,
    client_company_id: clientId,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    position: parsed.data.position ?? null,
    personal_id_masked: parsed.data.personal_id_masked ?? null,
    employment_start: parsed.data.employment_start ?? null,
    active: parsed.data.active ?? true,
  };

  const { data, error } = await supabase
    .from("employees")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ employee: data }, 201);
});
