import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import {
  canManageAgencyBilling,
  isSuperAdmin,
} from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  hasActiveReopenRequest,
  normalizeReportLockStatus,
  REPORT_LOCK_SELECT,
} from "@/lib/api/report-lock";
import { clearVisitSignatures } from "@/lib/api/visit-collaborators";

type Params = { params: Promise<{ id: string }> };

export const POST = withApiCatch(async (
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
    return jsonError(
      "Samo vlasnik agencije može da odobri ponovno otvaranje.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select(`id, agency_id, ${REPORT_LOCK_SELECT}`)
    .eq("id", id)
    .maybeSingle();

  if (
    visitError ||
    !visit ||
    (!isSuperAdmin(profile) && visit.agency_id !== profile.agency_id)
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  if (normalizeReportLockStatus(visit.report_lock_status) !== "closed") {
    return jsonError("Zapisnik nije zatvoren.", 400, {
      code: "REPORT_NOT_CLOSED",
    });
  }

  if (
    !hasActiveReopenRequest({
      report_lock_status: visit.report_lock_status,
      reopen_requested_at: visit.reopen_requested_at,
      reopen_approved_at: visit.reopen_approved_at,
    })
  ) {
    return jsonError("Nema aktivnog zahteva za ponovno otvaranje.", 400, {
      code: "NO_REOPEN_REQUEST",
    });
  }

  const approvedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_visits")
    .update({
      report_lock_status: "in_progress",
      reopen_approved_by: user.id,
      reopen_approved_at: approvedAt,
      signature_statement: null,
      report_content_hash: null,
      report_closed_at: null,
      report_closed_by: null,
    })
    .eq("id", id)
    .select(REPORT_LOCK_SELECT)
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Odobrenje nije uspelo.", 400, {
      code: "DATABASE_ERROR",
    });
  }

  await clearVisitSignatures(supabase, id);

  const audit = await insertDetailedAudit(supabase, {
    agency_id: visit.agency_id,
    actor_user_id: user.id,
    action: "field_visit.report_reopen_approved",
    entity_type: "field_visit",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: {
      justification: visit.reopen_justification,
      requested_by: visit.reopen_requested_by,
    },
  });
  if (audit.error) {
    console.error("[approve-reopen] audit failed", audit.error);
  }

  return jsonOk({
    report_lock_status: normalizeReportLockStatus(data.report_lock_status),
    report_closed_at: data.report_closed_at ?? null,
    report_closed_by: data.report_closed_by ?? null,
    reopen_requested_at: data.reopen_requested_at ?? null,
    reopen_requested_by: data.reopen_requested_by ?? null,
    reopen_justification: data.reopen_justification ?? null,
    reopen_approved_by: data.reopen_approved_by ?? user.id,
    reopen_approved_at: data.reopen_approved_at ?? approvedAt,
  });
});
