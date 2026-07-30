import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { documentCreateSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

async function loadClient(supabase: SupabaseClient, clientId: string) {
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

  const { data: client, error: cErr } = await loadClient(supabase, clientId);
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
    .from("documents")
    .select("*")
    .eq("agency_id", client.agency_id)
    .eq("client_company_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ documents: data ?? [] });
});

export const POST = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const { id: clientId } = await params;
  if (!isUuid(clientId)) {
    return jsonError("Nevažeći id klijenta.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = documentCreateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: client, error: cErr } = await loadClient(supabase, clientId);
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

  const targetClientId = parsed.data.client_company_id ?? clientId;
  if (targetClientId !== clientId) {
    return jsonError("client_company_id se ne poklapa sa putanjom.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const row = {
    agency_id: client.agency_id,
    client_company_id: clientId,
    folder: parsed.data.folder,
    storage_path: parsed.data.storage_path,
    filename: parsed.data.filename,
    mime_type: parsed.data.mime_type ?? null,
    size_bytes: parsed.data.size_bytes ?? null,
    uploaded_by: user.id,
  };

  const { data, error } = await supabase
    .from("documents")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ document: data }, 201);
});
