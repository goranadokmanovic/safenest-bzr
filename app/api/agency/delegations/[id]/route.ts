import { getAuthContext, canManageAgencyBilling, isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { isUuid } from "@/lib/api/agency-scope";

type Params = { params: Promise<{ id: string }> };

/** Opoziv delegacije: active=false, revoked_at=now() */
export const DELETE = withApiCatch(async (
  _request: Request,
  { params }: Params,
) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }
  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError(
      "Samo vlasnik agencije može da opozove delegacije.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const { data: existing } = await supabase
    .from("visit_delegations")
    .select("id, agency_id, active")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.agency_id !== profile.agency_id) {
    return jsonError("Delegacija nije pronađena.", 404, { code: "NOT_FOUND" });
  }
  if (!existing.active) {
    return jsonError("Delegacija je već opozvana.", 409, { code: "CONFLICT" });
  }

  const { data, error } = await supabase
    .from("visit_delegations")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select(
      "id, agency_id, from_user_id, to_user_id, granted_by, active, note, created_at, revoked_at",
    )
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  await insertDetailedAudit(supabase, {
    agency_id: profile.agency_id,
    actor_user_id: user.id,
    action: "visit_delegation.revoked",
    entity_type: "visit_delegation",
    entity_id: id,
  });

  return jsonOk({ delegation: data });
});
