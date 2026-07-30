import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import {
  canManageAgencyBilling,
  isSuperAdmin,
} from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  template_content: z.string().trim().min(1).max(100_000),
  is_default: z.boolean().optional(),
});

export const GET = withApiCatch(async () => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  if (!profile.agency_id && !isSuperAdmin(profile)) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  let query = supabase
    .from("report_templates")
    .select("id, agency_id, name, template_content, is_default, created_at, updated_at")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (profile.agency_id) {
    query = query.eq("agency_id", profile.agency_id);
  }

  const { data, error } = await query;
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ templates: data ?? [] });
});

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da menja šablone.", 403, {
      code: "FORBIDDEN",
    });
  }

  const agencyId = profile.agency_id;
  if (!agencyId) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = createSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const isDefault = parsed.data.is_default === true;
  if (isDefault) {
    await supabase
      .from("report_templates")
      .update({ is_default: false })
      .eq("agency_id", agencyId)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("report_templates")
    .insert({
      agency_id: agencyId,
      name: parsed.data.name,
      template_content: parsed.data.template_content,
      is_default: isDefault,
    })
    .select("id, agency_id, name, template_content, is_default, created_at, updated_at")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: agencyId,
    actor_user_id: user.id,
    action: "report_template.created",
    entity_type: "report_template",
    entity_id: data.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[report-templates] audit failed", audit.error);
  }

  return jsonOk({ template: data }, 201);
});
