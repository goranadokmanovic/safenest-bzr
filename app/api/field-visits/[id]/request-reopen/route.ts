import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  hasActiveReopenRequest,
  normalizeReportLockStatus,
  REPORT_LOCK_SELECT,
} from "@/lib/api/report-lock";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  justification: z.string().trim().min(1).max(5000),
});

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

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Obrazloženje je obavezno.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
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
    hasActiveReopenRequest({
      report_lock_status: visit.report_lock_status,
      reopen_requested_at: visit.reopen_requested_at,
      reopen_approved_at: visit.reopen_approved_at,
    })
  ) {
    return jsonError("Zahtev za ponovno otvaranje je već poslat.", 409, {
      code: "REOPEN_ALREADY_REQUESTED",
    });
  }

  const requestedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_visits")
    .update({
      reopen_requested_at: requestedAt,
      reopen_requested_by: user.id,
      reopen_justification: parsed.data.justification,
    })
    .eq("id", id)
    .select(REPORT_LOCK_SELECT)
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Zahtev nije sačuvan.", 400, {
      code: "DATABASE_ERROR",
    });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: visit.agency_id,
    actor_user_id: user.id,
    action: "field_visit.report_reopen_requested",
    entity_type: "field_visit",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: { justification: parsed.data.justification },
  });
  if (audit.error) {
    console.error("[request-reopen] audit failed", audit.error);
  }

  return jsonOk({
    report_lock_status: normalizeReportLockStatus(data.report_lock_status),
    report_closed_at: data.report_closed_at ?? null,
    report_closed_by: data.report_closed_by ?? null,
    reopen_requested_at: data.reopen_requested_at ?? requestedAt,
    reopen_requested_by: data.reopen_requested_by ?? user.id,
    reopen_justification:
      data.reopen_justification ?? parsed.data.justification,
    reopen_approved_by: data.reopen_approved_by ?? null,
    reopen_approved_at: data.reopen_approved_at ?? null,
  });
});
