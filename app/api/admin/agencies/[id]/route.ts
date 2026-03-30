import {
  getAuthContext,
  isSuperAdmin,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  adminAgencyPatchSchema,
  adminDeleteConfirmSchema,
} from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin/audit";
import { deleteAgencyCascade } from "@/lib/admin/delete-agency-cascade";

type Params = { params: { id: string } };

export const PATCH = withApiCatch(async (request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  if (!isSuperAdmin(auth.ctx.profile)) {
    return jsonError("Samo super admin.", 403, { code: "FORBIDDEN" });
  }

  const { id } = params;
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

  const raw = await readJsonBody(request, 32 * 1024);
  if (!raw.ok) return raw.response;

  const body =
    raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)
      ? raw.value
      : {};

  const parsed = adminAgencyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Neispravno telo.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.subscription_status !== undefined) {
    patch.subscription_status = parsed.data.subscription_status;
  }
  if (parsed.data.plan_tier !== undefined) {
    patch.plan_tier = parsed.data.plan_tier;
  }
  if (parsed.data.trial_ends_at !== undefined) {
    patch.trial_ends_at = parsed.data.trial_ends_at;
  }

  const { data, error } = await admin
    .from("agencies")
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, slug, subscription_status, plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id",
    )
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  const { error: auditErr } = await insertAdminAudit(admin, {
    actor_user_id: auth.ctx.user.id,
    action: "agency.patch",
    entity_type: "agency",
    entity_id: id,
    metadata: { patch },
  });
  if (auditErr) {
    console.error("[admin audit]", auditErr);
  }

  return jsonOk({ agency: data });
});

export const DELETE = withApiCatch(async (request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  if (!isSuperAdmin(auth.ctx.profile)) {
    return jsonError("Samo super admin.", 403, { code: "FORBIDDEN" });
  }

  const { id } = params;
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

  const raw = await readJsonBody(request, 8 * 1024);
  if (!raw.ok) return raw.response;

  const body =
    raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)
      ? raw.value
      : {};

  const parsed = adminDeleteConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Neispravno telo.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const expected = `DELETE_AGENCY|${id}`;
  if (parsed.data.confirmPhrase !== expected) {
    return jsonError(
      `Potvrdna fraza mora tačno biti: ${expected}`,
      400,
      { code: "CONFIRM_MISMATCH" },
    );
  }

  const { data: agency } = await admin
    .from("agencies")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!agency) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  const { error: delErr } = await deleteAgencyCascade(admin, id);
  if (delErr) {
    return jsonError(delErr.message, 400, { code: "DATABASE_ERROR" });
  }

  const { error: auditErr } = await insertAdminAudit(admin, {
    actor_user_id: auth.ctx.user.id,
    action: "agency.delete",
    entity_type: "agency",
    entity_id: id,
    metadata: { name: agency.name },
  });
  if (auditErr) {
    console.error("[admin audit]", auditErr);
  }

  return jsonOk({ ok: true });
});
