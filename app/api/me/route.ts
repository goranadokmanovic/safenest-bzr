import { getAuthContext } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { patchMeSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const GET = withApiCatch(async () => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  return jsonOk({ profile: auth.ctx.profile });
});

export const PATCH = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchMeSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const patch: Record<string, string> = {};
  if (parsed.data.full_name !== undefined)
    patch.full_name = parsed.data.full_name;
  if (parsed.data.locale !== undefined) patch.locale = parsed.data.locale;

  if (Object.keys(patch).length === 0) {
    return jsonError("Nema polja za ažuriranje.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data, error } = await auth.ctx.supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", auth.ctx.user.id)
    .select(
      "user_id, email, full_name, role, agency_id, client_company_id, locale",
    )
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ profile: data });
});
