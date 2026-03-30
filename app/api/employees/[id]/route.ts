import {
  getAuthContext,
  canReadAgencyRecords,
  canMutateAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { employeePatchSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: { id: string } };

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

  const { id } = params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Zaposleni nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    data.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  return jsonOk({ employee: data });
});

export const PATCH = withApiCatch(async (request: Request, { params }: Params) => {
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

  const { id } = params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = employeePatchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("employees")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return jsonError("Zaposleni nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  if (Object.keys(parsed.data).length === 0) {
    return jsonError("Nema polja za ažuriranje.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data, error } = await supabase
    .from("employees")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ employee: data });
});

export const DELETE = withApiCatch(async (_request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canMutateAgencyRecords(profile)) {
    return jsonError("Nemate dozvolu za brisanje.", 403, { code: "FORBIDDEN" });
  }

  const { id } = params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("employees")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return jsonError("Zaposleni nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const { error } = await supabase.from("employees").delete().eq("id", id);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ ok: true });
});
