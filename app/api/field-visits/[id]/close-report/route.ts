import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  normalizeReportLockStatus,
  REPORT_LOCK_SELECT,
} from "@/lib/api/report-lock";
import {
  buildSignatureStatement,
  hashReportContent,
  requiredSignerIds,
} from "@/lib/api/report-signature";
import type { ReportFields } from "@/lib/api/report-fields";
import {
  loadVisitAssignees,
  loadVisitCollaboratorIds,
  loadVisitSignatures,
} from "@/lib/api/visit-collaborators";

type Params = { params: Promise<{ id: string }> };

function normalizeFields(value: unknown): ReportFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: ReportFields = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

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

  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select(
      `id, agency_id, assigned_user_id, report, report_fields, ${REPORT_LOCK_SELECT}`,
    )
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

  if (normalizeReportLockStatus(visit.report_lock_status) === "closed") {
    return jsonError("Zapisnik je već zatvoren.", 409, {
      code: "REPORT_ALREADY_CLOSED",
    });
  }

  const collaboratorIds = await loadVisitCollaboratorIds(supabase, id);
  const required = requiredSignerIds(
    (visit.assigned_user_id as string | null) ?? null,
    collaboratorIds,
  );

  if (required.length === 0) {
    return jsonError("Poseta nema dodeljenog radnika.", 400, {
      code: "NO_ASSIGNEES",
    });
  }

  if (!required.includes(user.id) && !isSuperAdmin(profile)) {
    return jsonError(
      "Samo dodeljeni radnici na ovoj poseti mogu da potpišu zapisnik.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const existingSignatures = await loadVisitSignatures(supabase, id);
  if (existingSignatures.some((s) => s.user_id === user.id)) {
    return jsonError("Već ste potpisali ovaj zapisnik.", 409, {
      code: "ALREADY_SIGNED",
    });
  }

  const closedAtDate = new Date();
  const closedAt = closedAtDate.toISOString();
  const reportFields = normalizeFields(visit.report_fields);
  const reportText = typeof visit.report === "string" ? visit.report : null;
  const reportContentHash = hashReportContent(reportText, reportFields);

  const signerName =
    profile.full_name?.trim() || profile.email?.trim() || user.id.slice(0, 8);
  const signatureStatement = buildSignatureStatement({
    fullName: signerName,
    at: closedAtDate,
    locale: profile.locale ?? "sr",
  });

  const { error: sigError } = await supabase
    .from("field_visit_signatures")
    .insert({
      field_visit_id: id,
      user_id: user.id,
      signed_at: closedAt,
      signature_statement: signatureStatement,
      report_content_hash: reportContentHash,
    });

  if (sigError) {
    return jsonError(sigError.message, 400, { code: "DATABASE_ERROR" });
  }

  const signaturesAfter = await loadVisitSignatures(supabase, id);
  const signedIds = new Set(signaturesAfter.map((s) => s.user_id));
  const allSigned = required.every((uid) => signedIds.has(uid));

  let lockPayload: Record<string, unknown> = {
    // Mirror poslednjeg potpisa na field_visits (kompatibilnost / brzi prikaz)
    signature_statement: signatureStatement,
    report_content_hash: reportContentHash,
  };

  if (allSigned) {
    lockPayload = {
      ...lockPayload,
      report_lock_status: "closed",
      report_closed_at: closedAt,
      report_closed_by: user.id,
    };
  }

  const { data, error } = await supabase
    .from("field_visits")
    .update(lockPayload)
    .eq("id", id)
    .select(REPORT_LOCK_SELECT)
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Potpisivanje nije uspelo.", 400, {
      code: "DATABASE_ERROR",
    });
  }

  const assignees = await loadVisitAssignees(
    supabase,
    id,
    (visit.assigned_user_id as string | null) ?? null,
  );

  const audit = await insertDetailedAudit(supabase, {
    agency_id: visit.agency_id,
    actor_user_id: user.id,
    action: allSigned
      ? "field_visit.report_closed"
      : "field_visit.report_signed_partial",
    entity_type: "field_visit",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: {
      report_content_hash: reportContentHash,
      all_signed: allSigned,
      signed_count: signaturesAfter.length,
      required_count: required.length,
    },
  });
  if (audit.error) {
    console.error("[close-report] audit failed", audit.error);
  }

  return jsonOk({
    report_lock_status: normalizeReportLockStatus(data.report_lock_status),
    report_closed_at: data.report_closed_at ?? null,
    report_closed_by: data.report_closed_by ?? null,
    reopen_requested_at: data.reopen_requested_at ?? null,
    reopen_requested_by: data.reopen_requested_by ?? null,
    reopen_justification: data.reopen_justification ?? null,
    reopen_approved_by: data.reopen_approved_by ?? null,
    reopen_approved_at: data.reopen_approved_at ?? null,
    signature_statement: data.signature_statement ?? signatureStatement,
    report_content_hash: data.report_content_hash ?? reportContentHash,
    all_signed: allSigned,
    current_user_signed: true,
    assignees,
    signatures: signaturesAfter,
  });
});
