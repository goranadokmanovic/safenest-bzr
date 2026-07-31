import { clientIdsInScope } from "@/lib/api/client-scope";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isClientPortalUser, isSuperAdmin } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  fieldVisitSearchSchema,
  searchFieldVisits,
} from "@/lib/search/field-visits";

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = fieldVisitSearchSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const agencyId = isSuperAdmin(profile) ? null : profile.agency_id;
  if (!isSuperAdmin(profile) && !agencyId) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const visible = await clientIdsInScope(supabase, profile);
  if (!visible.ok) {
    return jsonError(visible.message, 400, { code: "DATABASE_ERROR" });
  }

  const outcome = await searchFieldVisits(
    supabase,
    agencyId,
    parsed.data,
    visible.clientIds,
  );
  if (!outcome.ok) {
    return jsonError(outcome.message, outcome.status, { code: outcome.code });
  }

  return jsonOk({
    results: outcome.results,
    detectedRiskLevel: outcome.detectedRiskLevel,
  });
});
