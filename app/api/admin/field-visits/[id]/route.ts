import {
  getAuthContext,
  isSuperAdmin,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { isUuid } from "@/lib/api/agency-scope";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin/audit";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withApiCatch(async (_request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  if (!isSuperAdmin(auth.ctx.profile)) {
    return jsonError("Samo super admin.", 403, { code: "FORBIDDEN" });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError("Nema SUPABASE_SERVICE_ROLE_KEY.", 503, {
      code: "CONFIG_ERROR",
    });
  }

  const { data: existing } = await admin
    .from("field_visits")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const { error } = await admin.from("field_visits").delete().eq("id", id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const { error: auditErr } = await insertAdminAudit(admin, {
    actor_user_id: auth.ctx.user.id,
    action: "field_visit.delete",
    entity_type: "field_visit",
    entity_id: id,
    metadata: { agency_id: existing.agency_id },
  });
  if (auditErr) {
    console.error("[admin audit]", auditErr);
  }

  return jsonOk({ ok: true });
});
