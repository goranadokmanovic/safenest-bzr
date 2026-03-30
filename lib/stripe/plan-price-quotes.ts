import Stripe from "stripe";
import type { AgencyPlanId } from "@/lib/plans/catalog";
import { AGENCY_PLANS } from "@/lib/plans/catalog";
import { getStripe } from "@/lib/stripe/server";
import {
  getStripePriceIdForPlan,
  stripePriceEnvName,
  type BillingInterval,
} from "@/lib/stripe/prices";

export type IntervalQuote = {
  priceId: string;
  currency: string;
  /** manji iznos u valuti (npr. 39.00), iz Stripe unit_amount */
  unitAmount: number | null;
  formatted: string;
  /** Stripe recurring.interval */
  interval: BillingInterval | null;
};

export type PlanPriceQuote = {
  planId: AgencyPlanId;
  month: IntervalQuote;
  year: IntervalQuote;
};

function centsToMajor(unitAmount: number | null | undefined): number | null {
  if (unitAmount == null) return null;
  return unitAmount / 100;
}

function formatMoney(currency: string, major: number | null): string {
  if (major == null) return "—";
  try {
    return new Intl.NumberFormat("sr-Latn-RS", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(major);
  } catch {
    return `${major} ${currency}`;
  }
}

async function quoteInterval(
  planId: AgencyPlanId,
  billingInterval: BillingInterval,
): Promise<IntervalQuote> {
  const envVar = stripePriceEnvName(planId, billingInterval);
  const priceId = getStripePriceIdForPlan(planId, billingInterval);
  const stripe = getStripe();
  try {
    const price = await stripe.prices.retrieve(priceId);

    const currency = (price.currency ?? "usd").toLowerCase();
    const unit = centsToMajor(price.unit_amount);
    const recurring = price.recurring;
    const stripeInterval =
      recurring?.interval === "year"
        ? "year"
        : recurring?.interval === "month"
          ? "month"
          : null;

    return {
      priceId,
      currency,
      unitAmount: unit,
      formatted: formatMoney(currency, unit),
      interval: stripeInterval as BillingInterval | null,
    };
  } catch (e) {
    const hint =
      " Proveri: 1) Test/live režim — cena mora biti u istom kao STRIPE_SECRET_KEY (sk_test vs sk_live). " +
      "2) Price ID u .env kopiran iz Product catalog istog naloga. 3) Cena nije obrisana/arhivirana.";
    if (e instanceof Stripe.errors.StripeInvalidRequestError) {
      throw new Error(
        `${e.message} [${envVar}=${priceId}, plan ${planId}, ${billingInterval}]${hint}`,
      );
    }
    throw e;
  }
}

/** Iznosi isključivo iz Stripe Price objekata (env → Price ID). */
export async function fetchPlanPriceQuotes(): Promise<PlanPriceQuote[]> {
  const plans = AGENCY_PLANS.map((p) => p.id);
  const quotes: PlanPriceQuote[] = [];

  for (const planId of plans) {
    const [month, year] = await Promise.all([
      quoteInterval(planId, "month"),
      quoteInterval(planId, "year"),
    ]);
    quotes.push({ planId, month, year });
  }

  return quotes;
}
