import type { SupabaseClient } from "@supabase/supabase-js";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { fieldPhotoCreateSchema } from "@/lib/api/schemas";
import {
  buildExtractedDatesFromOcr,
  buildPhotoStoragePath,
  FIELD_PHOTOS_BUCKET,
  FIELD_PHOTO_SIGNED_URL_TTL_SEC,
} from "@/lib/api/photo-storage";
import { generateEmbedding, buildVisitEmbeddingText } from "@/lib/api/embeddings";
import { withApiCatch } from "@/lib/api/with-api-catch";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB

const PHOTO_SELECT =
  "id, field_visit_id, photo_url, extracted_dates, ocr_confidence, ocr_text, created_at";

export const GET = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const fieldVisitId = new URL(request.url).searchParams.get("field_visit_id");
  if (!fieldVisitId || !isUuid(fieldVisitId)) {
    return jsonError("Nevažeći field_visit_id.", 400, { code: "INVALID_ID" });
  }

  const { data: visit } = await supabase
    .from("field_visits")
    .select("id, agency_id")
    .eq("id", fieldVisitId)
    .maybeSingle();

  const agencyId = profile.agency_id;
  if (
    !visit ||
    (!isSuperAdmin(profile) && visit.agency_id !== agencyId)
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const { data: photos, error } = await supabase
    .from("field_photos")
    .select(PHOTO_SELECT)
    .eq("field_visit_id", fieldVisitId)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  // photo_url već sadrži signed URL (generisan pri POST upload-u).
  return jsonOk({ photos: photos ?? [] });
});

/**
 * Best-effort regeneracija embedding-a terenske posete nakon dodavanja nove
 * fotografije sa OCR tekstom. Spaja postojeće napomene + ceo OCR tekst svih
 * fotografija (uključujući novu) i ponovo generiše embedding.
 * Greške se samo loguju — ne obaraju upload fotografije.
 */
async function regenerateVisitEmbedding(
  supabase: SupabaseClient,
  visitId: string,
): Promise<void> {
  try {
    const { data: visit } = await supabase
      .from("field_visits")
      .select("client_company_id, notes, metadata")
      .eq("id", visitId)
      .maybeSingle();

    if (!visit) return;

    let clientName: string | null = null;
    if (visit.client_company_id) {
      const { data: client } = await supabase
        .from("client_companies")
        .select("name")
        .eq("id", visit.client_company_id)
        .maybeSingle();
      clientName = client?.name ?? null;
    }

    const { data: photos } = await supabase
      .from("field_photos")
      .select("ocr_text")
      .eq("field_visit_id", visitId);

    const meta =
      visit.metadata && typeof visit.metadata === "object"
        ? (visit.metadata as Record<string, unknown>)
        : {};

    const text = buildVisitEmbeddingText({
      clientName,
      notes: visit.notes,
      riskLevel: typeof meta.risk_level === "string" ? meta.risk_level : null,
      extractedText:
        typeof meta.extracted_text === "string" ? meta.extracted_text : null,
      ocrTexts: (photos ?? []).map((p) => p.ocr_text),
    });

    const embedding = await generateEmbedding(text);
    if (!embedding) return;

    const { error } = await supabase
      .from("field_visits")
      .update({ embedding })
      .eq("id", visitId);

    if (error) {
      console.error(
        "[field-photos] embedding regeneracija upisa nije uspela",
        visitId,
        error.message,
      );
    }
  } catch (e) {
    console.error(
      "[field-photos] embedding regeneracija nije uspela",
      visitId,
      e instanceof Error ? e.message : e,
    );
  }
}

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const formData = await request.formData();
  const photo = formData.get("photo");

  if (!(photo instanceof File) || photo.size === 0) {
    return jsonError("Polje photo (fajl) je obavezno.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  if (photo.size > MAX_PHOTO_BYTES) {
    return jsonError("Slika je prevelika (max 15 MB).", 413, {
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
  const ocrText = formData.get("ocr_text");
  if (typeof ocrText === "string" && ocrText.trim()) {
    metaRaw.ocr_text = ocrText;
  }
  const ocrConfidence = formData.get("ocr_confidence");
  if (typeof ocrConfidence === "string" && ocrConfidence.trim()) {
    metaRaw.ocr_confidence = Number(ocrConfidence);
  }

  const parsed = fieldPhotoCreateSchema.safeParse(metaRaw);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (!isUuid(parsed.data.field_visit_id)) {
    return jsonError("Nevažeći field_visit_id.", 400, { code: "INVALID_ID" });
  }

  const { data: visit } = await supabase
    .from("field_visits")
    .select("id, agency_id")
    .eq("id", parsed.data.field_visit_id)
    .maybeSingle();

  const agencyId = profile.agency_id;
  if (
    !visit ||
    (!isSuperAdmin(profile) && (!agencyId || visit.agency_id !== agencyId))
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const storagePath = buildPhotoStoragePath(
    visit.agency_id,
    parsed.data.field_visit_id,
    photo.name,
  );

  const buffer = Buffer.from(await photo.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(FIELD_PHOTOS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: photo.type || "image/jpeg",
      upsert: false,
    });

  if (uploadErr) {
    return jsonError(uploadErr.message, 400, { code: "STORAGE_ERROR" });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(FIELD_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, FIELD_PHOTO_SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    await supabase.storage.from(FIELD_PHOTOS_BUCKET).remove([storagePath]);
    return jsonError(signErr?.message ?? "Signed URL nije kreiran.", 400, {
      code: "STORAGE_ERROR",
    });
  }

  const ocrTextValue = parsed.data.ocr_text?.trim() || null;
  const extractedDates =
    parsed.data.extracted_dates ?? buildExtractedDatesFromOcr(ocrTextValue);

  const { data, error } = await supabase
    .from("field_photos")
    .insert({
      field_visit_id: parsed.data.field_visit_id,
      photo_url: signed.signedUrl,
      extracted_dates: extractedDates,
      ocr_confidence: parsed.data.ocr_confidence ?? null,
      ocr_text: ocrTextValue,
    })
    .select(PHOTO_SELECT)
    .single();

  if (error) {
    await supabase.storage.from(FIELD_PHOTOS_BUCKET).remove([storagePath]);
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: visit.agency_id,
    actor_user_id: user.id,
    action: "field_photo.created",
    entity_type: "field_photo",
    entity_id: data.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
    metadata: {
      field_visit_id: parsed.data.field_visit_id,
      photo_url: signed.signedUrl,
    },
  });

  if (audit.error) {
    console.error("[field-photos] audit log failed", audit.error);
  }

  // Ako fotografija ima OCR tekst, regeneriši embedding posete u pozadini
  // (ne blokira odgovor korisniku).
  if (ocrTextValue) {
    void regenerateVisitEmbedding(supabase, parsed.data.field_visit_id);
  }

  return jsonOk({ field_photo: data }, 201);
});