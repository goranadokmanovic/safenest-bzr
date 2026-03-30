import { listRequiredStripePriceEnvNames } from "@/lib/stripe/prices";

/** Sva 6 Stripe Price ID (3 plana × mesečno/godišnje). */
export function areAllAgencyStripePricesConfigured(): boolean {
  return listRequiredStripePriceEnvNames().every(
    (name) => !!process.env[name]?.trim(),
  );
}

/** Checkout zahteva Stripe secret + svih 6 price ID + service role. */
export function isStripeCheckoutConfigured(): boolean {
  return (
    !!process.env.STRIPE_SECRET_KEY?.trim() &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    areAllAgencyStripePricesConfigured()
  );
}

/** Portal zahteva samo Stripe + service role (čitanje customer id). */
export function isStripePortalConfigured(): boolean {
  return (
    !!process.env.STRIPE_SECRET_KEY?.trim() &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}
