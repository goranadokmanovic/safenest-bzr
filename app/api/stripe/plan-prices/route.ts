import { getAuthContext } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { fetchPlanPriceQuotes } from "@/lib/stripe/plan-price-quotes";
import { isStripeCheckoutConfigured } from "@/lib/stripe/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — cene pretplate iz Stripe-a (po Price ID iz .env), za prikaz na dashboardu.
 * Zahteva prijavu (istektor kao sekcija naplate).
 */
export const GET = withApiCatch(async () => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  if (!isStripeCheckoutConfigured()) {
    return jsonError("Stripe cene nisu konfigurisane.", 503, {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  try {
    const plans = await fetchPlanPriceQuotes();
    return jsonOk({ plans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Greška pri čitanju Stripe cena.";
    console.error("[stripe plan-prices]", e);
    return jsonError(msg, 502, { code: "STRIPE_FETCH_ERROR" });
  }
});
