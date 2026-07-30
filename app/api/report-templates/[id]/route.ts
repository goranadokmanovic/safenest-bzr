import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import {
  canManageAgencyBilling,
  isSuperAdmin,
} from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    template_content: z.string().trim().min(1).max(100_000).optional(),
    is_default: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.template_content !== undefined ||
      d.is_default !== undefined,
    { message: "Pošalji bar jedno polje." },
  );

export const PATCH = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da menja šablone.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data: existing } = await supabase
    .from("report_templates")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Šablon nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (parsed.data.is_default === true) {
    await supabase
      .from("report_templates")
      .update({ is_default: false })
      .eq("agency_id", existing.agency_id)
      .eq("is_default", true)
      .neq("id", id);
  }

  const payload: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) payload.name = parsed.data.name;
  if (parsed.data.template_content !== undefined) {
    payload.template_content = parsed.data.template_content;
  }
  if (parsed.data.is_default !== undefined) {
    payload.is_default = parsed.data.is_default;
  }

  const { data, error } = await supabase
    .from("report_templates")
    .update(payload)
    .eq("id", id)
    .select("id, agency_id, name, template_content, is_default, created_at, updated_at")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: "report_template.updated",
    entity_type: "report_template",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[report-templates] audit failed", audit.error);
  }

  return jsonOk({ template: data });
});

export const DELETE = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da menja šablone.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data: existing } = await supabase
    .from("report_templates")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Šablon nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const { count, error: countError } = await supabase
    .from("field_visits")
    .select("id", { count: "exact", head: true })
    .eq("report_template_id", id);

  if (countError) {
    return jsonError(countError.message, 400, { code: "DATABASE_ERROR" });
  }
  if ((count ?? 0) > 0) {
    return jsonError(
      "Šablon se koristi na postojećim posetama i ne može se obrisati.",
      409,
      { code: "TEMPLATE_IN_USE", details: { visit_count: count } },
    );
  }

  const { error } = await supabase.from("report_templates").delete().eq("id", id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: "report_template.deleted",
    entity_type: "report_template",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[report-templates] audit failed", audit.error);
  }

  return jsonOk({ ok: true });
});
