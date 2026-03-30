import { getAuthContext } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
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
