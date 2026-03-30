import {
  getAuthContext,
  canManageAgencyBilling,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { isStripePortalConfigured } from "@/lib/stripe/env";

export const POST = withApiCatch(async (request: Request) => {
  if (!isStripePortalConfigured()) {
    return jsonError("Stripe nije podešen.", 503, {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile } = auth.ctx;

  if (!canManageAgencyBilling(profile) || !profile.agency_id) {
    return jsonError("Nemaš pravo da upravljaš pretplatom.", 403, {
      code: "FORBIDDEN",
    });
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError("Server nema podešen Supabase service role.", 500, {
      code: "CONFIG_ERROR",
    });
  }

  const { data: agency, error } = await admin
    .from("agencies")
    .select("stripe_customer_id")
    .eq("id", profile.agency_id)
    .single();

  if (error || !agency?.stripe_customer_id) {
    return jsonError("Nema Stripe kupca za ovu agenciju. Prvo pokreni plaćanje.", 400, {
      code: "NO_STRIPE_CUSTOMER",
    });
  }

  const origin =
    request.headers.get("origin") ?? new URL(request.url).origin;

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: agency.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });

  if (!portal.url) {
    return jsonError("Stripe nije vratio URL portala.", 502, {
      code: "STRIPE_ERROR",
    });
  }

  return jsonOk({ url: portal.url });
});
