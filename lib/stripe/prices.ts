import type { AgencyPlanId } from "@/lib/plans/catalog";

export type BillingInterval = "month" | "year";

const ENV_KEYS: Record<
  AgencyPlanId,
  Record<BillingInterval, string>
> = {
  agency_basic: {
    month: "STRIPE_PRICE_AGENCY_BASIC_MONTHLY",
    year: "STRIPE_PRICE_AGENCY_BASIC_YEARLY",
  },
  agency_l: {
    month: "STRIPE_PRICE_AGENCY_L_MONTHLY",
    year: "STRIPE_PRICE_AGENCY_L_YEARLY",
  },
  agency_xl: {
    month: "STRIPE_PRICE_AGENCY_XL_MONTHLY",
    year: "STRIPE_PRICE_AGENCY_XL_YEARLY",
  },
};

/**
 * Price ID iz env-a. U Stripe Dashboard svaka cena treba metadata: plan_tier = agency_basic | agency_l | agency_xl
 */
export function getStripePriceIdForPlan(
  planId: AgencyPlanId,
  interval: BillingInterval,
): string {
  const envName = ENV_KEYS[planId][interval];
  const id = process.env[envName]?.trim();
  if (!id) {
    throw new Error(
      `Nedostaje ${envName} u .env.local (Stripe Price ID za ${planId}, ${interval}).`,
    );
  }
  return id;
}

export function listRequiredStripePriceEnvNames(): string[] {
  return (["agency_basic", "agency_l", "agency_xl"] as const).flatMap(
    (plan) => [
      ENV_KEYS[plan].month,
      ENV_KEYS[plan].year,
    ],
  );
}

export function stripePriceEnvName(
  planId: AgencyPlanId,
  interval: BillingInterval,
): string {
  return ENV_KEYS[planId][interval];
}
