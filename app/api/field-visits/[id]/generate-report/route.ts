import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  generateAndSaveVisitReport,
  ReportGenerationError,
} from "@/lib/api/report-generation";
import { getUserLocale } from "@/lib/i18n/server";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 180;

export const POST = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;
  const { id } = await params;
  const language = await getUserLocale();

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: visit } = await supabase
    .from("field_visits")
    .select("id, agency_id, transcript_status")
    .eq("id", id)
    .maybeSingle();

  if (
    !visit ||
    (!isSuperAdmin(profile) && visit.agency_id !== profile.agency_id)
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  if (visit.transcript_status !== "done") {
    return jsonError(
      "Zapisnik se generiše tek nakon uspešne transkripcije.",
      400,
      { code: "VALIDATION_ERROR" },
    );
  }

  try {
    const result = await generateAndSaveVisitReport(supabase, id, language);

    const audit = await insertDetailedAudit(supabase, {
      agency_id: visit.agency_id,
      actor_user_id: user.id,
      action: "field_visit.report_generated",
      entity_type: "field_visit",
      entity_id: id,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: request.headers.get("user-agent"),
      metadata: {
        report_status: result.report_status,
        language,
        skipped: result.skipped ?? false,
      },
    });
    if (audit.error) {
      console.error("[generate-report] audit failed", audit.error);
    }

    return jsonOk({
      report: result.report,
      report_fields: result.report_fields,
      report_status: result.report_status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generisanje zapisnika nije uspelo.";
    console.error("[generate-report] failed", id, message);
    return jsonError(
      message,
      error instanceof ReportGenerationError ? error.status : 502,
      { code: "REPORT_GENERATION_ERROR" },
    );
  }
});
