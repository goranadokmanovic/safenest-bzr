import { getAuthContext } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { isUuid } from "@/lib/api/agency-scope";
import { withApiCatch } from "@/lib/api/with-api-catch";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApiCatch(async (_request: Request, { params }: Params) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const { id } = await params;
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }
  if (!data) {
    return jsonError("Obaveštenje nije pronađeno.", 404, { code: "NOT_FOUND" });
  }

  return jsonOk({ notification: data });
});
