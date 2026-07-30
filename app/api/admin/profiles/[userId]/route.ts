import {
  getAuthContext,
  isSuperAdmin,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  adminProfilePatchSchema,
  adminDeleteConfirmSchema,
} from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin/audit";
import { BILLABLE_AGENCY_ROLES } from "@/lib/plans/seats";
import { maxSeatsForPlanTier } from "@/lib/plans/catalog";

type Params = { params: Promise<{ userId: string }> };

export const PATCH = withApiCatch(async (request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  if (!isSuperAdmin(auth.ctx.profile)) {
    return jsonError("Samo super admin.", 403, { code: "FORBIDDEN" });
  }

  const { userId } = await params;
  if (!isUuid(userId)) {
    return jsonError("Nevažeći user id.", 400, { code: "INVALID_ID" });
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError("Nema SUPABASE_SERVICE_ROLE_KEY.", 503, {
      code: "CONFIG_ERROR",
    });
  }

  const { data: existingProfile, error: existingErr } = await admin
    .from("profiles")
    .select("user_id, agency_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingErr || !existingProfile) {
    return jsonError("Profil nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const raw = await readJsonBody(request, 16 * 1024);
  if (!raw.ok) return raw.response;

  const body =
    raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)
      ? raw.value
      : {};

  const parsed = adminProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Neispravno telo.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (userId === auth.ctx.user.id && parsed.data.role !== undefined && parsed.data.role !== "super_admin") {
    return jsonError(
      "Ne možeš sebi ukloniti ulogu super_admin.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const mergedAgencyId =
    parsed.data.agency_id !== undefined
      ? parsed.data.agency_id
      : existingProfile.agency_id;
  const mergedRole =
    parsed.data.role !== undefined
      ? parsed.data.role
      : existingProfile.role;

  const willBeBillable =
    mergedAgencyId != null &&
    typeof mergedAgencyId === "string" &&
    isUuid(mergedAgencyId) &&
    (BILLABLE_AGENCY_ROLES as readonly string[]).includes(mergedRole);

  if (willBeBillable) {
    const { data: agencyRow, error: agencyErr } = await admin
      .from("agencies")
      .select("plan_tier")
      .eq("id", mergedAgencyId)
      .maybeSingle();

    if (agencyErr || !agencyRow) {
      return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
    }

    const max = maxSeatsForPlanTier(agencyRow.plan_tier);
    if (max != null) {
      const { count, error: cErr } = await admin
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("agency_id", mergedAgencyId)
        .in("role", [...BILLABLE_AGENCY_ROLES])
        .neq("user_id", userId);

      if (cErr) {
        return jsonError(cErr.message, 400, { code: "DATABASE_ERROR" });
      }
      if ((count ?? 0) + 1 > max) {
        return jsonError(
          `Plan agencije dozvoljava najviše ${max} korisnika koji broje u pretplatu (vlasnik + agenti). Nadogradnja plana ili oslobađanje mesta.`,
          400,
          { code: "SEAT_LIMIT" },
        );
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) {
    patch.role = parsed.data.role;
  }
  if (parsed.data.agency_id !== undefined) {
    patch.agency_id = parsed.data.agency_id;
  }

  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select(
      "user_id, email, full_name, role, agency_id, client_company_id, locale",
    )
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Profil nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  const { error: auditErr } = await insertAdminAudit(admin, {
    actor_user_id: auth.ctx.user.id,
    action: "profile.patch",
    entity_type: "profile",
    entity_id: userId,
    metadata: { patch },
  });
  if (auditErr) {
    console.error("[admin audit]", auditErr);
  }

  return jsonOk({ profile: data });
});

export const DELETE = withApiCatch(async (request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  if (!isSuperAdmin(auth.ctx.profile)) {
    return jsonError("Samo super admin.", 403, { code: "FORBIDDEN" });
  }

  const { userId } = await params;
  if (!isUuid(userId)) {
    return jsonError("Nevažeći user id.", 400, { code: "INVALID_ID" });
  }

  if (userId === auth.ctx.user.id) {
    return jsonError("Ne možeš obrisati sopstveni nalog.", 403, {
      code: "FORBIDDEN",
    });
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

  const expected = `DELETE_USER|${userId}`;
  if (parsed.data.confirmPhrase !== expected) {
    return jsonError(
      `Potvrdna fraza mora tačno biti: ${expected}`,
      400,
      { code: "CONFIRM_MISMATCH" },
    );
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();

  if (!prof) {
    return jsonError("Profil nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  await admin.from("notifications").delete().eq("user_id", userId);
  await admin.from("agency_members").delete().eq("user_id", userId);

  let authErr = (await admin.auth.admin.deleteUser(userId)).error;
  if (authErr) {
    const { error: pDel } = await admin
      .from("profiles")
      .delete()
      .eq("user_id", userId);
    if (pDel) {
      return jsonError(
        `${authErr.message} | profil: ${pDel.message}`,
        400,
        { code: "DATABASE_ERROR" },
      );
    }
    authErr = (await admin.auth.admin.deleteUser(userId)).error;
    if (authErr) {
      return jsonError(authErr.message, 502, { code: "AUTH_DELETE_FAILED" });
    }
  }

  const { error: auditErr } = await insertAdminAudit(admin, {
    actor_user_id: auth.ctx.user.id,
    action: "profile.delete",
    entity_type: "profile",
    entity_id: userId,
    metadata: { email: prof.email },
  });
  if (auditErr) {
    console.error("[admin audit]", auditErr);
  }

  return jsonOk({ ok: true });
});
