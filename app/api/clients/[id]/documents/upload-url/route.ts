import type { SupabaseClient } from "@supabase/supabase-js";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { documentUploadUrlSchema } from "@/lib/api/schemas";
import { isUuid } from "@/lib/api/agency-scope";
import { readJsonBody } from "@/lib/api/read-json";
import { buildDocumentStoragePath } from "@/lib/api/documents-storage";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

const DOCUMENTS_BUCKET = "documents";

async function loadClient(supabase: SupabaseClient, clientId: string) {
  return supabase
    .from("client_companies")
    .select("id, agency_id")
    .eq("id", clientId)
    .maybeSingle();
}

/**
 * Vraća potpisani URL za direktan upload u Storage (`documents` bucket).
 * Klijent posle uploada poziva POST /api/clients/[id]/documents sa `storage_path`.
 */
export const POST = withApiCatch(async (request: Request, { params }: Params) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const clientId = (await params).id;
  if (!isUuid(clientId)) {
    return jsonError("Nevažeći id klijenta.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request, 16 * 1024);
  if (!raw.ok) return raw.response;

  const parsed = documentUploadUrlSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: client, error: cErr } = await loadClient(supabase, clientId);
  if (cErr || !client) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }

  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    client.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const storagePath = buildDocumentStoragePath(
    client.agency_id,
    clientId,
    parsed.data.filename,
  );

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return jsonError(error?.message ?? "Ne mogu da kreiram URL za upload.", 400, {
      code: "STORAGE_ERROR",
    });
  }

  return jsonOk({
    bucket: DOCUMENTS_BUCKET,
    storage_path: storagePath,
    token: data.token,
    signed_url: data.signedUrl,
  });
});
