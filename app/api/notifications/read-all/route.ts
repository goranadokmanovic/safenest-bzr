import { getAuthContext } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const POST = withApiCatch(async (_request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ updated: data?.length ?? 0 });
});