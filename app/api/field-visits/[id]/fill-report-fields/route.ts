import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  transcribeAudio,
  TranscriptionError,
  type NoiseMode,
} from "@/lib/api/transcription";
import {
  fieldsFromVisitRow,
  fillReportFieldsFromTranscript,
  ReportGenerationError,
} from "@/lib/api/report-generation";
import {
  parseTemplateFieldNames,
  reportFieldsToText,
} from "@/lib/api/report-fields";
import { getUserLocale } from "@/lib/i18n/server";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { MAX_TRANSCRIPTION_AUDIO_BYTES } from "@/lib/api/audio-storage";
import { userHasSignedVisit } from "@/lib/api/visit-collaborators";

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

  const form = await request.formData().catch(() => null);
  if (!form) {
    return jsonError("Očekivan je multipart/form-data.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const audioEntry = form.get("audio");
  const noiseRaw = form.get("noise_mode");
  const noiseMode =
    noiseRaw === "quiet" || noiseRaw === "noisy"
      ? (noiseRaw as NoiseMode)
      : null;

  if (!(audioEntry instanceof Blob) || audioEntry.size === 0) {
    return jsonError("Audio snimak je obavezan.", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (!noiseMode) {
    return jsonError("Važeći noise_mode je obavezan (quiet|noisy).", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (audioEntry.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return jsonError("Audio fajl prelazi limit od 25 MB.", 413, {
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select(
      "id, agency_id, report, report_fields, report_template_id, report_status, report_lock_status",
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

  if (visit.report_lock_status === "closed") {
    return jsonError(
      "Zapisnik je zatvoren i ne može se menjati. Zatraži ponovno otvaranje.",
      409,
      { code: "REPORT_LOCKED" },
    );
  }

  if (await userHasSignedVisit(supabase, id, user.id)) {
    return jsonError(
      "Već ste potpisali zapisnik — izmene nisu moguće dok se ne zatvori ili ponovo otvori.",
      409,
      { code: "ALREADY_SIGNED" },
    );
  }

  if (!visit.report_template_id) {
    return jsonError("Poseta nema dodeljen šablon zapisnika.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data: template, error: templateError } = await supabase
    .from("report_templates")
    .select("id, template_content")
    .eq("id", visit.report_template_id)
    .maybeSingle();

  if (templateError || !template?.template_content) {
    return jsonError("Šablon zapisnika nije pronađen.", 404, {
      code: "NOT_FOUND",
    });
  }

  const fieldNames = parseTemplateFieldNames(template.template_content);
  if (fieldNames.length === 0) {
    return jsonError(
      "Šablon nema prepoznatljiva polja (očekivan format: \"Naziv polja:\").",
      400,
      { code: "VALIDATION_ERROR" },
    );
  }

  const currentFields =
    fieldsFromVisitRow({
      report: visit.report,
      report_fields: visit.report_fields,
      template_content: template.template_content,
    }) ?? {};

  const filename =
    audioEntry instanceof File && audioEntry.name
      ? audioEntry.name
      : `fill-fields-${id}.webm`;

  try {
    const transcription = await transcribeAudio({
      audio: audioEntry,
      filename,
      noiseMode,
      language,
    });

    const reportFields = await fillReportFieldsFromTranscript({
      fieldNames,
      currentFields,
      transcript: transcription.transcript,
      language,
    });
    const reportText = reportFieldsToText(reportFields);

    const { error: saveError } = await supabase
      .from("field_visits")
      .update({
        report_fields: reportFields,
        report: reportText,
        report_status: "done",
      })
      .eq("id", id);

    if (saveError) {
      return jsonError(saveError.message, 400, { code: "DATABASE_ERROR" });
    }

    const audit = await insertDetailedAudit(supabase, {
      agency_id: visit.agency_id,
      actor_user_id: user.id,
      action: "field_visit.report_fields_voice_filled",
      entity_type: "field_visit",
      entity_id: id,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      user_agent: request.headers.get("user-agent"),
      metadata: {
        model: transcription.model,
        noise_mode: noiseMode,
        language: transcription.language,
        field_count: Object.keys(reportFields).length,
      },
    });
    if (audit.error) {
      console.error("[fill-report-fields] audit failed", audit.error);
    }

    return jsonOk({
      report_fields: reportFields,
      report: reportText,
      report_status: "done",
      fill_transcript: transcription.transcript,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Popunjavanje polja nije uspelo.";
    console.error("[fill-report-fields] failed", id, message);
    if (error instanceof TranscriptionError) {
      return jsonError(message, error.status, {
        code: "TRANSCRIPTION_ERROR",
      });
    }
    return jsonError(
      message,
      error instanceof ReportGenerationError ? error.status : 502,
      { code: "REPORT_FILL_ERROR" },
    );
  }
});
