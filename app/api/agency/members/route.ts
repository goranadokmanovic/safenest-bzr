import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canManageAgencyBilling,
  canReadAgencyRecords,
  getAuthContext,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { maxSeatsForPlanTier } from "@/lib/plans/catalog";
import { countBillableAgencySeats } from "@/lib/plans/seats";
import {
  AGENCY_STAFF_ROLES,
  MEMBER_ROLE_BY_PROFILE_ROLE,
  countAgencyOwners,
  listAgencyMembers,
  type AgencyStaffRole,
} from "@/lib/queries/agency-members";

const patchSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(AGENCY_STAFF_ROLES),
});

export const GET = withApiCatch(async () => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  if (!canReadAgencyRecords(profile) || !profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, {
      code: "FORBIDDEN",
    });
  }

  const result = await listAgencyMembers(supabase, profile.agency_id);
  if (!result.ok) {
    return jsonError(result.message, 400, { code: "DATABASE_ERROR" });
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", profile.agency_id)
    .maybeSingle();

  const max = maxSeatsForPlanTier(agency?.plan_tier);
  const used = await countBillableAgencySeats(supabase, profile.agency_id);

  return jsonOk({
    members: result.value,
    seats: { used, max },
    can_manage: canManageAgencyBilling(profile) || isSuperAdmin(profile),
  });
});

/** Promena uloge člana: PATCH /api/agency/members */
export const PATCH = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da menja uloge.", 403, {
      code: "FORBIDDEN",
    });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchSchema.safeParse(raw.value ?? {});
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { user_id: targetId, role: nextRole } = parsed.data;

  if (targetId === user.id) {
    return jsonError("Ne možete menjati sopstvenu ulogu.", 409, {
      code: "SELF_ROLE_CHANGE",
    });
  }

  const target = await loadAgencyMemberProfile(
    supabase,
    profile.agency_id,
    targetId,
  );
  if (!target) {
    return jsonError("Član nije pronađen u vašoj agenciji.", 404, {
      code: "NOT_FOUND",
    });
  }

  if (target.role === nextRole) {
    return jsonOk({ ok: true, unchanged: true });
  }

  if (target.role === "agency_owner") {
    const owners = await countAgencyOwners(supabase, profile.agency_id);
    if (!owners.ok) {
      return jsonError(owners.message, 400, { code: "DATABASE_ERROR" });
    }
    if (owners.value <= 1) {
      return jsonError(
        "Agencija mora imati bar jednog vlasnika. Postavite drugog vlasnika pre promene.",
        409,
        { code: "LAST_OWNER" },
      );
    }
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError("Nema SUPABASE_SERVICE_ROLE_KEY.", 503, {
      code: "CONFIG_ERROR",
    });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: nextRole })
    .eq("user_id", targetId)
    .eq("agency_id", profile.agency_id);

  if (profileError) {
    return jsonError(profileError.message, 400, { code: "DATABASE_ERROR" });
  }

  const { error: memberError } = await admin.from("agency_members").upsert(
    {
      agency_id: profile.agency_id,
      user_id: targetId,
      member_role: MEMBER_ROLE_BY_PROFILE_ROLE[nextRole],
    },
    { onConflict: "agency_id,user_id" },
  );

  if (memberError) {
    return jsonError(memberError.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: profile.agency_id,
    actor_user_id: user.id,
    action: "agency_member.role_changed",
    entity_type: "agency_member",
    entity_id: targetId,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[agency-members] role audit failed", audit.error);
  }

  return jsonOk({ ok: true });
});

/** Uklanjanje člana iz agencije: DELETE /api/agency/members?user_id=<uuid> */
export const DELETE = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  const targetId =
    new URL(request.url).searchParams.get("user_id")?.trim() ?? "";
  if (!isUuid(targetId)) {
    return jsonError("Nevažeći user id.", 400, { code: "INVALID_ID" });
  }
  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da ukloni radnika.", 403, {
      code: "FORBIDDEN",
    });
  }

  if (targetId === user.id) {
    return jsonError("Ne možete ukloniti sami sebe iz agencije.", 409, {
      code: "SELF_REMOVAL",
    });
  }

  const target = await loadAgencyMemberProfile(
    supabase,
    profile.agency_id,
    targetId,
  );
  if (!target) {
    return jsonError("Član nije pronađen u vašoj agenciji.", 404, {
      code: "NOT_FOUND",
    });
  }

  if (target.role === "agency_owner") {
    const owners = await countAgencyOwners(supabase, profile.agency_id);
    if (!owners.ok) {
      return jsonError(owners.message, 400, { code: "DATABASE_ERROR" });
    }
    if (owners.value <= 1) {
      return jsonError(
        "Agencija mora imati bar jednog vlasnika. Postavite drugog vlasnika pre uklanjanja.",
        409,
        { code: "LAST_OWNER" },
      );
    }
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError("Nema SUPABASE_SERVICE_ROLE_KEY.", 503, {
      code: "CONFIG_ERROR",
    });
  }

  // Zaduženja bi ostala da vise na korisniku koji više nije u agenciji, pa bi
  // ti klijenti ispali iz opsega svih saradnika.
  const { error: unassignError } = await admin
    .from("client_companies")
    .update({ assigned_collaborator_id: null })
    .eq("agency_id", profile.agency_id)
    .eq("assigned_collaborator_id", targetId);

  if (unassignError) {
    return jsonError(unassignError.message, 400, { code: "DATABASE_ERROR" });
  }

  const { error: memberError } = await admin
    .from("agency_members")
    .delete()
    .eq("agency_id", profile.agency_id)
    .eq("user_id", targetId);

  if (memberError) {
    return jsonError(memberError.message, 400, { code: "DATABASE_ERROR" });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ agency_id: null })
    .eq("user_id", targetId)
    .eq("agency_id", profile.agency_id);

  if (profileError) {
    return jsonError(profileError.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: profile.agency_id,
    actor_user_id: user.id,
    action: "agency_member.removed",
    entity_type: "agency_member",
    entity_id: targetId,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[agency-members] remove audit failed", audit.error);
  }

  return jsonOk({ ok: true });
});

async function loadAgencyMemberProfile(
  supabase: SupabaseClient,
  agencyId: string,
  userId: string,
): Promise<{ user_id: string; role: AgencyStaffRole } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id, role, agency_id")
    .eq("user_id", userId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!data) return null;
  const role = data.role as string;
  if (!(AGENCY_STAFF_ROLES as readonly string[]).includes(role)) return null;
  return { user_id: data.user_id as string, role: role as AgencyStaffRole };
}
