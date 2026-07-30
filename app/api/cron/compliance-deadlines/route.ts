import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { runComplianceDeadlineNotifications } from "@/lib/compliance/notify-deadlines";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

async function handle(request: Request) {
  if (!authorizeCron(request)) {
    return jsonError("Neovlašćen cron poziv.", 401, { code: "UNAUTHORIZED" });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return jsonError("Nedostaje SUPABASE_SERVICE_ROLE_KEY.", 503, {
      code: "MISCONFIGURED",
    });
  }

  const admin = createAdminSupabaseClient();
  const result = await runComplianceDeadlineNotifications(admin);
  return jsonOk(result);
}

/** Vercel Cron (GET) i ručni trigger. */
export const GET = withApiCatch(handle);
export const POST = withApiCatch(handle);
