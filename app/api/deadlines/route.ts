import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { agencyFilterForList, isUuid } from "@/lib/api/agency-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { deadlinesQuerySchema } from "@/lib/api/schemas";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const GET = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canReadAgencyRecords(profile)) {
    return jsonError("Nemate pristup.", 403, { code: "FORBIDDEN" });
  }

  const url = new URL(request.url);
  const raw = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    client_id: url.searchParams.get("client_id") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  };

  const parsed = deadlinesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("Neispravni query parametri.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if (parsed.data.client_id && !isUuid(parsed.data.client_id)) {
    return jsonError("Nevažeći client_id.", 400, { code: "INVALID_ID" });
  }

  if (parsed.data.client_id && !isSuperAdmin(profile) && profile.agency_id) {
    const { data: client } = await supabase
      .from("client_companies")
      .select("agency_id")
      .eq("id", parsed.data.client_id)
      .maybeSingle();
    if (!client || client.agency_id !== profile.agency_id) {
      return jsonError("Nema pristupa tom klijentu.", 403, {
        code: "FORBIDDEN",
      });
    }
  }

  const agencyParam = url.searchParams.get("agency_id");
  const scope = agencyFilterForList(profile, agencyParam);
  if ("error" in scope) return scope.error;

  let query = supabase.from("deadlines").select("*").order("due_at", {
    ascending: true,
  });

  if (scope.agencyId) {
    query = query.eq("agency_id", scope.agencyId);
  }

  if (parsed.data.from) {
    query = query.gte("due_at", parsed.data.from);
  }
  if (parsed.data.to) {
    query = query.lte("due_at", parsed.data.to);
  }
  if (parsed.data.client_id) {
    query = query.eq("client_company_id", parsed.data.client_id);
  }
  if (parsed.data.type) {
    query = query.eq("entity_type", parsed.data.type);
  }

  const { data, error } = await query;

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ deadlines: data ?? [] });
});
