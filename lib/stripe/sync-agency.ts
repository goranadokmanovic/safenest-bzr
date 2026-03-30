import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgencyStripeUpdate = {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  subscription_status: string;
  plan_tier: string;
};

function planTierFromSubscription(sub: Stripe.Subscription): string {
  const meta = sub.metadata?.plan_tier;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  const item = sub.items.data[0];
  const fromPrice = item?.price?.metadata?.plan_tier;
  if (typeof fromPrice === "string" && fromPrice.trim()) return fromPrice.trim();
  return "agency_basic";
}

/** Mapira Stripe status na vrednost u koloni agencies.subscription_status. */
export function subscriptionStatusFromStripe(
  status: Stripe.Subscription.Status,
): string {
  return status;
}

export function agencyRowFromSubscription(
  customerId: string,
  sub: Stripe.Subscription | null,
): AgencyStripeUpdate {
  if (!sub) {
    return {
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      subscription_status: "canceled",
      plan_tier: "agency_basic",
    };
  }
  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: subscriptionStatusFromStripe(sub.status),
    plan_tier: planTierFromSubscription(sub),
  };
}

export async function updateAgencyStripeFields(
  admin: SupabaseClient,
  agencyId: string,
  patch: AgencyStripeUpdate,
): Promise<{ error: Error | null }> {
  const { error } = await admin
    .from("agencies")
    .update({
      stripe_customer_id: patch.stripe_customer_id,
      stripe_subscription_id: patch.stripe_subscription_id,
      subscription_status: patch.subscription_status,
      plan_tier: patch.plan_tier,
    })
    .eq("id", agencyId);

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
