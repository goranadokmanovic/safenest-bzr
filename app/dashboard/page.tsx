import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AgencyBootstrap } from "@/components/auth/agency-bootstrap";
import { LogoutButton } from "@/components/auth/logout-button";
import { StripeBillingSection } from "@/components/dashboard/stripe-billing";
import { canManageAgencyBilling } from "@/lib/api/session";
import { isStripeCheckoutConfigured } from "@/lib/stripe/env";
import { isAgencyStaffRole, parseAppRole } from "@/lib/auth/roles";
import { BackButton } from "@/components/ui/BackButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const fromName = (name ?? "").trim();
  if (fromName) {
    const parts = fromName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    }
    return fromName.slice(0, 2).toUpperCase();
  }
  return (email ?? "?").slice(0, 2).toUpperCase();
}

function roleLabel(role: string) {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "agency_owner":
      return "Vlasnik agencije";
    case "agency_collaborator":
      return "Saradnik";
    case "field_worker":
      return "Terenski radnik";
    case "client_user":
      return "Klijent";
    default:
      return role;
  }
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const locale = await getUserLocale();
  const m = getMessages(locale);
  const h = m.agencija.home;

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

  const role = parseAppRole(profile?.role);
  const isAgencyStaff = isAgencyStaffRole(role) && !!profile?.agency_id;

  let agencyName: string | null = null;
  let agencyBilling:
    | {
        subscription_status: string | null;
        plan_tier: string | null;
        trial_ends_at: string | null;
        stripe_customer_id: string | null;
      }
    | null = null;
  let clientCount: number | null = null;
  let visitCount: number | null = null;

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

    if (isAgencyStaff) {
      const [clientsRes, visitsRes] = await Promise.all([
        supabase
          .from("client_companies")
          .select("id", { count: "exact", head: true })
          .eq("agency_id", profile.agency_id)
          .is("archived_at", null),
        supabase
          .from("field_visits")
          .select("id", { count: "exact", head: true })
          .eq("agency_id", profile.agency_id),
      ]);
      clientCount = clientsRes.count;
      visitCount = visitsRes.count;
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

  const displayName = profile?.full_name?.trim() || profile?.email || "Korisnik";
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <main
      className={
        isAgencyStaff
          ? "relative isolate min-h-[calc(100vh-8rem)] space-y-8"
          : "relative mx-auto min-h-screen max-w-3xl overflow-hidden px-6 py-10"
      }
    >
      <PageCornerDecor kind="halftone" variant="canvas" />

      {!isAgencyStaff ? <BackButton href="/" className="mb-5" /> : null}

      <header className="bzr-page-header relative z-10 !border-0 !pb-0">
        <div className="flex min-w-0 items-start gap-4">
          {!isAgencyStaff ? (
            <BrandLogo href="/dashboard" variant="mark" />
          ) : null}
          <div className="min-w-0">
            <p className="bzr-eyebrow">Kontrolna tabla</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Zdravo{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
              {isAgencyStaff
                ? h.intro.replace("{agency}", agencyName ?? "—")
                : "Pregled naloga, agencije i brzih akcija."}
            </p>
          </div>
        </div>
        {isAgencyStaff ? (
          <Link href="/agencija/field-visits/new" className="bzr-btn-primary">
            + Nova poseta
          </Link>
        ) : (
          <LogoutButton />
        )}
      </header>

      {!isAgencyStaff ? <div className="bzr-divider max-w-sm" /> : null}

      {profileError ? (
        <p
          className="relative z-10 rounded-xl border border-danger/30 bg-[rgb(var(--color-danger-bg))] px-4 py-3 text-sm text-danger"
          role="alert"
        >
          Profil nije učitan. Proveri da li postoji red u tabeli profiles.
        </p>
      ) : null}

      {profile ? (
        <section className="bzr-card relative z-10">
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-[#1a1816] shadow-btn"
              style={{
                background:
                  "linear-gradient(165deg, rgb(var(--color-accent-bright)), rgb(var(--color-accent)))",
              }}
              aria-hidden
            >
              {initials(profile.full_name, profile.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-ink">{displayName}</p>
              <p className="truncate text-sm text-ink/55">{profile.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="bzr-badge-neutral">{roleLabel(profile.role)}</span>
                {agencyName ? (
                  <span className="bzr-badge-warning">{agencyName}</span>
                ) : null}
                <span className="bzr-badge-neutral">
                  {(profile.locale ?? "sr").toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/15 bg-bg/40 px-3.5 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                Email
              </dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">
                {profile.email}
              </dd>
            </div>
            <div className="rounded-xl border border-border/15 bg-bg/40 px-3.5 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                Agencija
              </dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">
                {agencyName ?? (needsBootstrap ? "Kreiranje…" : "—")}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <AgencyBootstrap
        enabled={!!needsBootstrap}
        agencyNameHint={bootstrapAgencyNameHint}
        fullNameHint={bootstrapFullNameHint}
      />

      {isAgencyStaff ? (
        <dl className="relative z-10 grid gap-5 sm:grid-cols-2 lg:max-w-2xl">
          <div className="bzr-stat">
            <dt className="text-sm font-semibold uppercase tracking-wider text-ink/50">
              {h.clientsCount}
            </dt>
            <dd className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
              {clientCount ?? m.common.noData}
            </dd>
          </div>
          <div className="bzr-stat">
            <dt className="text-sm font-semibold uppercase tracking-wider text-ink/50">
              {h.visitsCount}
            </dt>
            <dd className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
              {visitCount ?? m.common.noData}
            </dd>
          </div>
        </dl>
      ) : null}

      {!isAgencyStaff ? (
        <section className="relative z-10 mt-8">
          <h2 className="bzr-eyebrow">Brze akcije</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {profile?.role === "super_admin" ? (
              <li>
                <Link href="/admin" className="bzr-nav-card">
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      Admin panel
                    </span>
                    <span className="mt-0.5 block text-xs text-ink/55">
                      Agencije, korisnici, audit
                    </span>
                  </span>
                  <span className="bzr-nav-card-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/" className="bzr-nav-card">
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    Početna
                  </span>
                  <span className="mt-0.5 block text-xs text-ink/55">
                    Brend i prijava
                  </span>
                </span>
                <span className="bzr-nav-card-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          </ul>
        </section>
      ) : null}

      {showStripeSection && agencyBilling ? (
        <div className="relative z-10 mt-2">
          <StripeBillingSection
            subscriptionStatus={agencyBilling.subscription_status}
            planTier={agencyBilling.plan_tier}
            trialEndsAt={agencyBilling.trial_ends_at}
            hasStripeCustomer={!!agencyBilling.stripe_customer_id}
          />
        </div>
      ) : null}

      {!isStripeCheckoutConfigured() &&
      profile &&
      canManageAgencyBilling(profile) ? (
        <p className="relative z-10 rounded-xl border border-border/20 bg-surface/60 px-4 py-3 text-sm text-ink/55">
          Stripe pretplata: u{" "}
          <code className="font-mono text-accent-muted">.env.local</code> podesi{" "}
          <code className="font-mono text-accent-muted">STRIPE_SECRET_KEY</code>,{" "}
          <code className="font-mono text-accent-muted">STRIPE_WEBHOOK_SECRET</code>
          ,{" "}
          <code className="font-mono text-accent-muted">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          i šest{" "}
          <code className="font-mono text-accent-muted">STRIPE_PRICE_AGENCY_*</code>{" "}
          ID-jeva (vidi{" "}
          <code className="font-mono text-accent-muted">.env.example</code>).
        </p>
      ) : null}
    </main>
  );
}
