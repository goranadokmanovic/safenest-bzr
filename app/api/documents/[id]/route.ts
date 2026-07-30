import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { documentPatchSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

const DOCUMENTS_BUCKET = "documents";

async function loadDocument(supabase: SupabaseClient, id: string) {
  return supabase
    .from("documents")
    .select("*")
    .eq("id", id)
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

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data, error } = await loadDocument(supabase, id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Dokument nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    data.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  return jsonOk({ document: data });
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

  const parsed = documentPatchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: existing, error: loadErr } = await loadDocument(supabase, id);
  if (loadErr || !existing) {
    return jsonError("Dokument nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  if (parsed.data.client_company_id) {
    const { data: client } = await supabase
      .from("client_companies")
      .select("agency_id")
      .eq("id", parsed.data.client_company_id)
      .maybeSingle();
    if (!client || client.agency_id !== existing.agency_id) {
      return jsonError("Klijent ne pripada istoj agenciji.", 400, {
        code: "VALIDATION_ERROR",
      });
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ document: data });
});

export const DELETE = withApiCatch(async (_request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: existing, error: loadErr } = await loadDocument(supabase, id);
  if (loadErr || !existing) {
    return jsonError("Dokument nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  if (existing.storage_path) {
    const { error: storageErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([existing.storage_path]);
    if (storageErr) {
      return jsonError(
        `Brisanje fajla nije uspelo: ${storageErr.message}`,
        400,
        { code: "STORAGE_ERROR" },
      );
    }
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ ok: true });
});
