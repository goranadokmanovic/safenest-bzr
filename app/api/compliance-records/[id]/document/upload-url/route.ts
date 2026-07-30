import { z } from "zod";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { buildDocumentStoragePath } from "@/lib/api/documents-storage";

type Params = { params: Promise<{ id: string }> };

const DOCUMENTS_BUCKET = "documents";

const schema = z.object({
  filename: z.string().trim().min(1).max(255),
});

/**
 * Signed upload URL za dokument vezan za compliance zapis.
 * Posle uploada klijent PATCH-uje record.document_url = storage_path.
 */
export const POST = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request, 16 * 1024);
  if (!raw.ok) return raw.response;
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: record, error: loadErr } = await supabase
    .from("compliance_records")
    .select("id, agency_id, client_company_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !record) {
    return jsonError("Zapis nije pronađen.", 404, { code: "NOT_FOUND" });
  }
  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    record.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const storagePath = buildDocumentStoragePath(
    record.agency_id,
    record.client_company_id,
    parsed.data.filename,
  );

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return jsonError(
      error?.message ?? "Ne mogu da kreiram URL za upload.",
      400,
      { code: "STORAGE_ERROR" },
    );
  }

  return jsonOk({
    bucket: DOCUMENTS_BUCKET,
    storage_path: storagePath,
    token: data.token,
    signed_url: data.signedUrl,
  });
});
