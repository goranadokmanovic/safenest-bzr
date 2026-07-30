import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProfile } from "@/lib/api/session";
import { isSuperAdmin } from "@/lib/api/session";
import { jsonError } from "@/lib/api/responses";

export type AgencySubscriptionSnapshot = {
  subscription_status: string;
  trial_ends_at: string | null;
};

const WRITE_STATUSES = new Set(["active", "trialing"]);

function isActiveSubscriptionRequired(): boolean {
  return process.env.REQUIRE_ACTIVE_SUBSCRIPTION === "true";
}

/** Da li agencija sme da menja podatke (klijenti, zaposleni, dokumenti, rokovi). */
export function isSubscriptionWriteAllowed(
  agency: AgencySubscriptionSnapshot,
): boolean {
  if (WRITE_STATUSES.has(agency.subscription_status)) {
    if (agency.subscription_status === "trialing" && agency.trial_ends_at) {
      return new Date(agency.trial_ends_at) > new Date();
    }
    return true;
  }

  if (agency.subscription_status === "none" && agency.trial_ends_at) {
    return new Date(agency.trial_ends_at) > new Date();
  }

  return false;
}

export async function requireSubscriptionForMutation(
  supabase: SupabaseClient,
  profile: AuthProfile,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (isSuperAdmin(profile)) {
    return { ok: true };
  }

  if (!profile.agency_id) {
    return {
      ok: false,
      response: jsonError("Niste dodeljeni agenciji.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  // Feature flag: REQUIRE_ACTIVE_SUBSCRIPTION kontroliše da li je aktivna pretplata
  // obavezna za upis podataka. Isključeno tokom internog testiranja i za
  // jednokratno prodate (licencirane) instance koje ne koriste SaaS naplatu.
  // Uključiti pre javnog SaaS lansiranja.
  if (isActiveSubscriptionRequired()) {
    const { data, error } = await supabase
      .from("agencies")
      .select("subscription_status, trial_ends_at")
      .eq("id", profile.agency_id)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        response: jsonError(error.message, 400, { code: "DATABASE_ERROR" }),
      };
    }

    if (!data) {
      return {
        ok: false,
        response: jsonError("Agencija nije pronađena.", 404, {
          code: "NOT_FOUND",
        }),
      };
    }

    if (!isSubscriptionWriteAllowed(data)) {
      return {
        ok: false,
        response: jsonError(
          "Pretplata nije aktivna. Obnovite pretplatu da biste nastavili sa izmenama.",
          402,
          { code: "SUBSCRIPTION_REQUIRED" },
        ),
      };
    }
  }

  return { ok: true };
}
