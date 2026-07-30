import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/api/responses";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Result =
  | { ok: true; skip: true }
  | { ok: true; skip: false; value: string | null }
  | { ok: false; response: Response };

/**
 * Proverava da je assigned_collaborator_id null ili agency_collaborator
 * iste agencije kao klijent. `undefined` = polje nije poslato (preskoči).
 */
export async function resolveAssignedCollaboratorId(
  supabase: SupabaseClient,
  agencyId: string,
  assignedCollaboratorId: string | null | undefined,
): Promise<Result> {
  if (assignedCollaboratorId === undefined) {
    return { ok: true, skip: true };
  }
  if (assignedCollaboratorId === null) {
    return { ok: true, skip: false, value: null };
  }

  let client = supabase;
  try {
    client = createAdminSupabaseClient();
  } catch {
    /* nema service role — koristi user klijent */
  }

  const { data, error } = await client
    .from("profiles")
    .select("user_id, role, agency_id")
    .eq("user_id", assignedCollaboratorId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: jsonError(error.message, 400, { code: "DATABASE_ERROR" }),
    };
  }
  if (
    !data ||
    data.role !== "agency_collaborator" ||
    data.agency_id !== agencyId
  ) {
    return {
      ok: false,
      response: jsonError(
        "Zaduženi saradnik mora biti agency_collaborator iste agencije.",
        400,
        { code: "VALIDATION_ERROR" },
      ),
    };
  }

  return { ok: true, skip: false, value: assignedCollaboratorId };
}
