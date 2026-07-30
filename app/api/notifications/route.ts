import { getAuthContext, isSuperAdmin } from "@/lib/api/session";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { notificationCreateSchema } from "@/lib/api/schemas";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const GET = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? "0") || 0,
  );

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ notifications: data ?? [] });
});

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = notificationCreateSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  // Podrazumevano — obaveštenje ide ulogovanom korisniku.
  // Slanje drugom korisniku (user_id) je dozvoljeno samo super adminu.
  const targetUserId = parsed.data.user_id ?? user.id;
  if (parsed.data.user_id && parsed.data.user_id !== user.id && !isSuperAdmin(profile)) {
    return jsonError(
      "Nemate dozvolu da šaljete obaveštenja drugim korisnicima.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: targetUserId,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity ?? null,
      dedupe_key: parsed.data.dedupe_key ?? null,
      metadata: parsed.data.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    // Unique constraint na dedupe_key — tretiraj kao "već postoji", ne kao grešku.
    if (error.code === "23505") {
      return jsonError("Obaveštenje sa ovim dedupe_key već postoji.", 409, {
        code: "DUPLICATE",
      });
    }
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ notification: data }, 201);
});