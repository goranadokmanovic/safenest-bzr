import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { FIELD_AUDIO_BUCKET } from "@/lib/api/audio-storage";
import {
  transcribeAudio,
  TranscriptionError,
  type NoiseMode,
} from "@/lib/api/transcription";
import { generateAndSaveVisitReport } from "@/lib/api/report-generation";
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
  // Isti locale kao SR/EN toggle (cookie + profiles.locale; default "sr").
  const language = await getUserLocale();

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select("id, agency_id, audio_url, noise_mode")
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
  if (!visit.audio_url) {
    return jsonError("Poseta nema audio snimak.", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (visit.noise_mode !== "quiet" && visit.noise_mode !== "noisy") {
    return jsonError("Poseta nema važeći noise_mode.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { error: processingError } = await supabase
    .from("field_visits")
    .update({ transcript_status: "processing" })
    .eq("id", id);
  if (processingError) {
    return jsonError(processingError.message, 400, { code: "DATABASE_ERROR" });
  }

  try {
    const { data: audio, error: downloadError } = await supabase.storage
      .from(FIELD_AUDIO_BUCKET)
      .download(visit.audio_url);
    if (downloadError || !audio) {
      throw new TranscriptionError(
        downloadError?.message ?? "Audio fajl nije pronađen u Storage-u.",
        400,
      );
    }

    const filename =
      visit.audio_url.split("/").pop() || `field-visit-${id}.webm`;
    const result = await transcribeAudio({
      audio,
      filename,
      noiseMode: visit.noise_mode as NoiseMode,
      language,
    });

    const { error: saveError } = await supabase
      .from("field_visits")
      .update({
        transcript: result.transcript,
        transcript_status: "done",
      })
      .eq("id", id);
    if (saveError) {
      throw new TranscriptionError(saveError.message, 400);
    }

    const audit = await insertDetailedAudit(supabase, {
      agency_id: visit.agency_id,
      actor_user_id: user.id,
      action: "field_visit.transcribed",
      entity_type: "field_visit",
      entity_id: id,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: request.headers.get("user-agent"),
      metadata: {
        model: result.model,
        noise_mode: visit.noise_mode,
        language: result.language,
      },
    });
    if (audit.error) {
      console.error("[transcribe] audit log failed", audit.error);
    }

    // Faza B/C: nakon uspešne transkripcije generiši strukturirani zapisnik.
    let reportStatus: string = "pending";
    let report: string | null = null;
    let reportFields: Record<string, string> | null = null;
    try {
      const reportResult = await generateAndSaveVisitReport(
        supabase,
        id,
        language,
      );
      reportStatus = reportResult.report_status;
      report = reportResult.report;
      reportFields = reportResult.report_fields;
    } catch (reportError) {
      reportStatus = "failed";
      console.error(
        "[transcribe] report generation failed",
        id,
        reportError instanceof Error ? reportError.message : reportError,
      );
    }

    return jsonOk({
      transcript: result.transcript,
      transcript_status: "done",
      model: result.model,
      language: result.language,
      report,
      report_fields: reportFields,
      report_status: reportStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transkripcija nije uspela.";
    const { error: statusError } = await supabase
      .from("field_visits")
      .update({ transcript_status: "failed" })
      .eq("id", id);
    if (statusError) {
      console.error("[transcribe] failed status update", statusError.message);
    }
    console.error("[transcribe] failed", id, message);

    return jsonError(message, error instanceof TranscriptionError ? error.status : 502, {
      code: "TRANSCRIPTION_ERROR",
    });
  }
});
