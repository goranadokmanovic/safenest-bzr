import type { SupabaseClient } from "@supabase/supabase-js";
import { maxSeatsForPlanTier } from "@/lib/plans/catalog";

/** Uloge koje broje u limit pretplate (plaća agencija). */
export const BILLABLE_AGENCY_ROLES = [
  "agency_owner",
  "agency_collaborator",
  "field_worker",
] as const;

export async function countBillableAgencySeats(
  admin: SupabaseClient,
  agencyId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .in("role", [...BILLABLE_AGENCY_ROLES]);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Provera pre dodele korisnika agenciji: da li posle dodele prelazimo limit plana.
 */
export async function wouldExceedAgencySeatLimit(
  admin: SupabaseClient,
  agencyId: string,
  planTier: string | null | undefined,
  options: {
    /** user_id koji se dodaje / prebacuje u agenciju */
    userId: string;
    /** trenutni agency_id tog korisnika (pre izmene) */
    currentAgencyId: string | null;
  },
): Promise<{ ok: true } | { ok: false; max: number; current: number }> {
  const max = maxSeatsForPlanTier(planTier);
  if (max == null) return { ok: true };

  const alreadyInTarget =
    options.currentAgencyId != null &&
    options.currentAgencyId === agencyId;

  if (alreadyInTarget) return { ok: true };

  const used = await countBillableAgencySeats(admin, agencyId);
  if (used + 1 > max) {
    return { ok: false, max, current: used };
  }
  return { ok: true };
}
