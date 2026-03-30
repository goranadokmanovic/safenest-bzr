import {
  getAuthContext,
  canReadAgencyRecords,
  canManageAgencyBilling,
  isClientPortalUser,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { agencyPatchSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const GET = withApiCatch(async () => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  if (!canReadAgencyRecords(profile) || !profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data, error } = await supabase
    .from("agencies")
    .select(
      "id, created_at, updated_at, name, slug, legal_name, tax_id, address, phone, trial_ends_at, subscription_status, plan_tier, stripe_customer_id, stripe_subscription_id",
    )
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  if (!data) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  return jsonOk({ agency: data });
});

export const PATCH = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  if (!canManageAgencyBilling(profile)) {
    return jsonError("Samo vlasnik agencije može menjati podatke agencije.", 403, {
      code: "FORBIDDEN",
    });
  }

  const raw = await readJsonBody(request, 16 * 1024);
  if (!raw.ok) return raw.response;

  const body =
    raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)
      ? raw.value
      : {};

  const parsed = agencyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Neispravno telo.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    patch.name = parsed.data.name;
  }
  if (parsed.data.legal_name !== undefined) {
    patch.legal_name = parsed.data.legal_name;
  }
  if (parsed.data.tax_id !== undefined) {
    patch.tax_id = parsed.data.tax_id;
  }
  if (parsed.data.address !== undefined) {
    patch.address = parsed.data.address;
  }
  if (parsed.data.phone !== undefined) {
    patch.phone = parsed.data.phone;
  }

  const { data, error } = await supabase
    .from("agencies")
    .update(patch)
    .eq("id", profile.agency_id)
    .select(
      "id, created_at, updated_at, name, slug, legal_name, tax_id, address, phone, trial_ends_at, subscription_status, plan_tier, stripe_customer_id, stripe_subscription_id",
    )
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  if (!data) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  return jsonOk({ agency: data });
});
