import {
  getAuthContext,
  canManageAgencyBilling,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { stripeCheckoutBodySchema } from "@/lib/api/schemas";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { getStripePriceIdForPlan } from "@/lib/stripe/prices";
import { isStripeCheckoutConfigured } from "@/lib/stripe/env";

export const POST = withApiCatch(async (request: Request) => {
  if (!isStripeCheckoutConfigured()) {
    return jsonError("Stripe ili Supabase service role nisu podešeni.", 503, {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, user } = auth.ctx;

  if (!canManageAgencyBilling(profile) || !profile.agency_id) {
    return jsonError("Nemaš pravo da upravljaš pretplatom.", 403, {
      code: "FORBIDDEN",
    });
  }

  const raw = await readJsonBody(request, 16 * 1024);
  if (!raw.ok) return raw.response;

  let body: unknown = raw.value;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (Object.keys(o).length === 0) {
      body = { planId: "agency_basic", billingInterval: "month" };
    }
  } else {
    body = { planId: "agency_basic", billingInterval: "month" };
  }

  const parsed = stripeCheckoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Neispravno telo zahteva.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
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

  const agencyId = profile.agency_id;

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .select("id, stripe_customer_id")
    .eq("id", agencyId)
    .single();

  if (agencyError || !agency) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  const stripe = getStripe();
  const planId = parsed.data.planId;
  const billingInterval = parsed.data.billingInterval;
  let priceId: string;
  try {
    priceId = getStripePriceIdForPlan(planId, billingInterval);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepoznata greška cene.";
    return jsonError(msg, 503, { code: "STRIPE_PRICE_CONFIG" });
  }

  let customerId = agency.stripe_customer_id as string | null;

  if (!customerId) {
    const search = await stripe.customers.search({
      query: `metadata['agency_id']:'${agencyId}'`,
      limit: 1,
    });
    if (search.data[0]) {
      customerId = search.data[0].id;
      await admin
        .from("agencies")
        .update({ stripe_customer_id: customerId })
        .eq("id", agencyId);
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { agency_id: agencyId },
    });
    customerId = customer.id;
    await admin
      .from("agencies")
      .update({ stripe_customer_id: customerId })
      .eq("id", agencyId);
  }

  const origin =
    request.headers.get("origin") ?? new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?stripe=success`,
    cancel_url: `${origin}/dashboard?stripe=cancel`,
    client_reference_id: agencyId,
    metadata: { agency_id: agencyId },
    subscription_data: {
      metadata: {
        agency_id: agencyId,
        plan_tier: planId,
        billing_interval: billingInterval,
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return jsonError("Stripe nije vratio URL za plaćanje.", 502, {
      code: "STRIPE_ERROR",
    });
  }

  return jsonOk({ url: session.url });
});
