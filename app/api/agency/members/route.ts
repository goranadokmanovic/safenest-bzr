import {
  getAuthContext,
  canReadAgencyRecords,
  isClientPortalUser,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
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
    .from("agency_members")
    .select(
      "id, created_at, agency_id, user_id, member_role, invited_at, joined_at, invited_by, profiles:user_id (user_id, email, full_name, role, agency_id, client_company_id, locale)",
    )
    .eq("agency_id", profile.agency_id)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ members: data ?? [] });
});
