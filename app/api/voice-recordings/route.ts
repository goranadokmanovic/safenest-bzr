import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { voiceRecordingCreateSchema } from "@/lib/api/schemas";
import {
  buildVoiceStoragePath,
  VOICE_RECORDINGS_BUCKET,
} from "@/lib/api/voice-storage";
import { withApiCatch } from "@/lib/api/with-api-catch";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  if (!profile.agency_id && !isSuperAdmin(profile)) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const agencyId = profile.agency_id;
  if (!agencyId) {
    return jsonError("Polje agency_id je obavezno.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return jsonError("Polje audio (fajl) je obavezno.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError("Audio fajl je prevelik (max 25 MB).", 413, {
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  const metaRaw: Record<string, unknown> = {};
  const metaJson = formData.get("metadata");
  if (typeof metaJson === "string" && metaJson.trim()) {
    try {
      Object.assign(metaRaw, JSON.parse(metaJson) as Record<string, unknown>);
    } catch {
      return jsonError("metadata mora biti validan JSON.", 400, {
        code: "VALIDATION_ERROR",
      });
    }
  }

  if (formData.get("field_visit_id")) {
    metaRaw.field_visit_id = formData.get("field_visit_id");
  }
  if (formData.get("client_company_id")) {
    metaRaw.client_company_id = formData.get("client_company_id");
  }
  if (formData.get("duration_seconds")) {
    metaRaw.duration_seconds = Number(formData.get("duration_seconds"));
  }

  const parsed = voiceRecordingCreateSchema.safeParse(metaRaw);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (parsed.data.field_visit_id) {
    if (!isUuid(parsed.data.field_visit_id)) {
      return jsonError("Nevažeći field_visit_id.", 400, { code: "INVALID_ID" });
    }
    const { data: visit } = await supabase
      .from("field_visits")
      .select("id, agency_id")
      .eq("id", parsed.data.field_visit_id)
      .maybeSingle();
    if (!visit || visit.agency_id !== agencyId) {
      return jsonError("Terenska poseta nije pronađena.", 404, {
        code: "NOT_FOUND",
      });
    }
  }

  if (parsed.data.client_company_id) {
    if (!isUuid(parsed.data.client_company_id)) {
      return jsonError("Nevažeći client_company_id.", 400, {
        code: "INVALID_ID",
      });
    }
    const { data: client } = await supabase
      .from("client_companies")
      .select("id, agency_id")
      .eq("id", parsed.data.client_company_id)
      .maybeSingle();
    if (!client || client.agency_id !== agencyId) {
      return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
    }
  }

  const storagePath = buildVoiceStoragePath(agencyId, audio.name);
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(VOICE_RECORDINGS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: audio.type || "audio/webm",
      upsert: false,
    });

  if (uploadErr) {
    return jsonError(uploadErr.message, 400, { code: "STORAGE_ERROR" });
  }

  const { data: signed } = await supabase.storage
    .from(VOICE_RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 dana

  const audioUrl = signed?.signedUrl ?? null;

  const { data, error } = await supabase
    .from("voice_recordings")
    .insert({
      agency_id: agencyId,
      field_visit_id: parsed.data.field_visit_id ?? null,
      client_company_id: parsed.data.client_company_id ?? null,
      recorded_by: user.id,
      storage_path: storagePath,
      audio_url: audioUrl,
      mime_type: audio.type || "audio/webm",
      duration_seconds: parsed.data.duration_seconds ?? null,
      transcript_status: "pending",
      metadata: parsed.data.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(VOICE_RECORDINGS_BUCKET).remove([storagePath]);
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: agencyId,
    actor_user_id: user.id,
    action: "voice_recording.created",
    entity_type: "voice_recording",
    entity_id: data.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: {
      storage_path: storagePath,
      field_visit_id: parsed.data.field_visit_id ?? null,
    },
  });

  if (audit.error) {
    console.error("[voice-recordings] audit log failed", audit.error);
  }

  return jsonOk({ voice_recording: data }, 201);
});
