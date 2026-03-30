import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AgencyBootstrap } from "@/components/auth/agency-bootstrap";
import { LogoutButton } from "@/components/auth/logout-button";
import { StripeBillingSection } from "@/components/dashboard/stripe-billing";
import { canManageAgencyBilling } from "@/lib/api/session";
import { isStripeCheckoutConfigured } from "@/lib/stripe/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const regMeta = user.user_metadata as Record<string, unknown> | undefined;
  const bootstrapAgencyNameHint =
    typeof regMeta?.agency_name === "string" ? regMeta.agency_name : null;
  const bootstrapFullNameHint =
    typeof regMeta?.full_name === "string" ? regMeta.full_name : null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email, role, locale, agency_id")
    .eq("user_id", user.id)
    .single();

  let agencyName: string | null = null;
  let agencyBilling:
    | {
        subscription_status: string | null;
        plan_tier: string | null;
        trial_ends_at: string | null;
        stripe_customer_id: string | null;
      }
    | null = null;

  if (profile?.agency_id) {
    const { data: agency } = await supabase
      .from("agencies")
      .select(
        "name, subscription_status, plan_tier, trial_ends_at, stripe_customer_id",
      )
      .eq("id", profile.agency_id)
      .single();
    agencyName = agency?.name ?? null;
    if (agency) {
      agencyBilling = {
        subscription_status: agency.subscription_status ?? null,
        plan_tier: agency.plan_tier ?? null,
        trial_ends_at: agency.trial_ends_at ?? null,
        stripe_customer_id: agency.stripe_customer_id ?? null,
      };
    }
  }

  const showStripeSection =
    !!profile &&
    canManageAgencyBilling(profile) &&
    !!profile.agency_id &&
    isStripeCheckoutConfigured();

  const needsBootstrap =
    !!profile &&
    !profile.agency_id &&
    profile.role !== "super_admin" &&
    profile.role !== "client_user";

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink pb-6">
        <h1 className="text-2xl font-bold text-ink">Kontrolna tabla</h1>
        <LogoutButton />
      </div>

      {profileError ? (
        <p className="mt-6 text-red-700" role="alert">
          Profil nije učitan. Proveri da li postoji red u tabeli profiles.
        </p>
      ) : null}

      {profile ? (
        <dl className="mt-8 space-y-3 text-sm">
          <div className="flex gap-2 border-b border-ink/20 py-2">
            <dt className="w-40 font-medium text-ink">Email</dt>
            <dd className="text-ink/90">{profile.email}</dd>
          </div>
          <div className="flex gap-2 border-b border-ink/20 py-2">
            <dt className="w-40 font-medium text-ink">Ime</dt>
            <dd className="text-ink/90">{profile.full_name || "—"}</dd>
          </div>
          <div className="flex gap-2 border-b border-ink/20 py-2">
            <dt className="w-40 font-medium text-ink">Uloga</dt>
            <dd className="text-ink/90">{profile.role}</dd>
          </div>
          <div className="flex gap-2 border-b border-ink/20 py-2">
            <dt className="w-40 font-medium text-ink">Jezik</dt>
            <dd className="text-ink/90">{profile.locale}</dd>
          </div>
          <div className="flex gap-2 border-b border-ink/20 py-2">
            <dt className="w-40 font-medium text-ink">Agencija</dt>
            <dd className="text-ink/90">
              {agencyName ?? (needsBootstrap ? "Kreiranje…" : "—")}
            </dd>
          </div>
        </dl>
      ) : null}

      <AgencyBootstrap
        enabled={!!needsBootstrap}
        agencyNameHint={bootstrapAgencyNameHint}
        fullNameHint={bootstrapFullNameHint}
      />

      {showStripeSection && agencyBilling ? (
        <StripeBillingSection
          subscriptionStatus={agencyBilling.subscription_status}
          planTier={agencyBilling.plan_tier}
          trialEndsAt={agencyBilling.trial_ends_at}
          hasStripeCustomer={!!agencyBilling.stripe_customer_id}
        />
      ) : null}

      {!isStripeCheckoutConfigured() &&
      profile &&
      canManageAgencyBilling(profile) ? (
        <p className="mt-8 text-sm text-ink/60">
          Stripe pretplata: u <code className="font-mono">.env.local</code>{" "}
          podesi{" "}
          <code className="font-mono">STRIPE_SECRET_KEY</code>,{" "}
          <code className="font-mono">STRIPE_WEBHOOK_SECRET</code>,{" "}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> i{" "}
          šest{" "}
          <code className="font-mono">STRIPE_PRICE_AGENCY_*</code> ID-jeva
          (vidi <code className="font-mono">.env.example</code>).
        </p>
      ) : null}

      <p className="mt-10 flex flex-wrap gap-4 text-sm text-ink/70">
        {profile?.role === "super_admin" ? (
          <Link href="/admin" className="font-medium underline text-ink">
            Admin panel
          </Link>
        ) : null}
        <Link href="/" className="underline">
          Početna
        </Link>
      </p>
    </main>
  );
}
