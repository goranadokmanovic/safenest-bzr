import {
  getAuthContext,
  canReadAgencyRecords,
  canMutateAgencyRecords,
  isClientPortalUser,
} from "@/lib/api/session";
import { agencyFilterForList, agencyIdForInsert } from "@/lib/api/agency-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { clientCreateSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
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
  const q = url.searchParams.get("q")?.trim() || "";
  const includeArchived = url.searchParams.get("archived") === "1";
  const agencyParam = url.searchParams.get("agency_id");

  const scope = agencyFilterForList(profile, agencyParam);
  if ("error" in scope) return scope.error;

  let query = supabase
    .from("client_companies")
    .select("*")
    .order("name", { ascending: true });

  if (scope.agencyId) {
    query = query.eq("agency_id", scope.agencyId);
  }

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  if (q) {
    const safe = q.replace(/%/g, "").replace(/,/g, "");
    query = query.or(
      `name.ilike.%${safe}%,legal_name.ilike.%${safe}%,tax_id.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ clients: data ?? [] });
});

export const POST = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canMutateAgencyRecords(profile)) {
    return jsonError("Nemate dozvolu za izmenu.", 403, { code: "FORBIDDEN" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = clientCreateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const agency = agencyIdForInsert(profile, parsed.data.agency_id);
  if ("error" in agency) return agency.error;

  const row = {
    agency_id: agency.agencyId,
    name: parsed.data.name,
    legal_name: parsed.data.legal_name ?? null,
    tax_id: parsed.data.tax_id ?? null,
    activity_sector: parsed.data.activity_sector ?? null,
    address: parsed.data.address ?? null,
    contact_email:
      parsed.data.contact_email === "" || parsed.data.contact_email == null
        ? null
        : parsed.data.contact_email,
    contact_phone: parsed.data.contact_phone ?? null,
    semaphore: parsed.data.semaphore ?? "green",
    notes: parsed.data.notes ?? null,
  };

  const { data, error } = await supabase
    .from("client_companies")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ client: data }, 201);
});
