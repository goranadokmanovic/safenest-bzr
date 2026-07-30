import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import { isSuperAdmin } from "@/lib/api/session";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  buildAudioStoragePath,
  FIELD_AUDIO_BUCKET,
  MAX_TRANSCRIPTION_AUDIO_BYTES,
} from "@/lib/api/audio-storage";
import { withApiCatch } from "@/lib/api/with-api-catch";

const noiseModeSchema = z.enum(["quiet", "noisy"]);

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const formData = await request.formData();
  const audio = formData.get("audio");
  const fieldVisitId = formData.get("field_visit_id");
  const noiseMode = noiseModeSchema.safeParse(formData.get("noise_mode"));

  if (!(audio instanceof File) || audio.size === 0) {
    return jsonError("Polje audio (fajl) je obavezno.", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (audio.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return jsonError(
      "Audio fajl prelazi OpenAI limit od 25 MB. Snimite kraću belešku.",
      413,
      { code: "PAYLOAD_TOO_LARGE" },
    );
  }
  if (audio.type && !audio.type.startsWith("audio/")) {
    return jsonError("Fajl mora biti audio snimak.", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (typeof fieldVisitId !== "string" || !isUuid(fieldVisitId)) {
    return jsonError("Nevažeći field_visit_id.", 400, { code: "INVALID_ID" });
  }
  if (!noiseMode.success) {
    return jsonError("noise_mode mora biti quiet ili noisy.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select("id, agency_id, audio_url")
    .eq("id", fieldVisitId)
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

  const storagePath = buildAudioStoragePath(
    visit.agency_id,
    fieldVisitId,
    audio.name,
  );
  const buffer = Buffer.from(await audio.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(FIELD_AUDIO_BUCKET)
    .upload(storagePath, buffer, {
      contentType: audio.type || "audio/webm",
      upsert: false,
    });

  if (uploadError) {
    return jsonError(uploadError.message, 400, { code: "STORAGE_ERROR" });
  }

  const { error: updateError } = await supabase
    .from("field_visits")
    .update({
      audio_url: storagePath,
      noise_mode: noiseMode.data,
      transcript: null,
      transcript_status: "pending",
    })
    .eq("id", fieldVisitId);

  if (updateError) {
    await supabase.storage.from(FIELD_AUDIO_BUCKET).remove([storagePath]);
    return jsonError(updateError.message, 400, { code: "DATABASE_ERROR" });
  }

  if (
    typeof visit.audio_url === "string" &&
    visit.audio_url &&
    visit.audio_url !== storagePath
  ) {
    const { error } = await supabase.storage
      .from(FIELD_AUDIO_BUCKET)
      .remove([visit.audio_url]);
    if (error) {
      console.error("[field-audio] old object removal failed", error.message);
    }
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: visit.agency_id,
    actor_user_id: user.id,
    action: "field_visit.audio_uploaded",
    entity_type: "field_visit",
    entity_id: fieldVisitId,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: { storage_path: storagePath, noise_mode: noiseMode.data },
  });
  if (audit.error) {
    console.error("[field-audio] audit log failed", audit.error);
  }

  return jsonOk(
    {
      field_visit_id: fieldVisitId,
      audio_url: storagePath,
      transcript_status: "pending",
    },
    201,
  );
});
