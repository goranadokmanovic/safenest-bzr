import { getMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { deadlinePatchSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: existing } = await supabase
    .from("deadlines")
    .select("id, agency_id, client_company_id")
    .eq("id", id)
    .maybeSingle();
  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Rok nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = deadlinePatchSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (
    parsed.data.client_company_id !== undefined &&
    parsed.data.client_company_id !== null &&
    !isUuid(parsed.data.client_company_id)
  ) {
    return jsonError("Nevažeći client_company_id.", 400, {
      code: "INVALID_ID",
    });
  }

  const { data, error } = await supabase
    .from("deadlines")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: "deadline.updated",
    entity_type: "deadline",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: { changed_fields: Object.keys(parsed.data) },
  });
  if (audit.error) {
    console.error("[deadlines] audit log failed", audit.error);
  }

  return jsonOk({ deadline: data });
});

export const DELETE = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: existing } = await supabase
    .from("deadlines")
    .select("id, agency_id, client_company_id")
    .eq("id", id)
    .maybeSingle();
  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Rok nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const { error } = await supabase.from("deadlines").delete().eq("id", id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: "deadline.deleted",
    entity_type: "deadline",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: { client_company_id: existing.client_company_id },
  });
  if (audit.error) {
    console.error("[deadlines] audit log failed", audit.error);
  }

  return jsonOk({ ok: true });
});