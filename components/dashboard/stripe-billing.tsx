"use client";

import { useEffect, useState } from "react";
import { AGENCY_PLANS } from "@/lib/plans/catalog";
import type { AgencyPlanId } from "@/lib/plans/catalog";

type BillingInterval = "month" | "year";

type IntervalQuote = {
  formatted: string;
};

type PlanQuoteRow = {
  planId: AgencyPlanId;
  month: IntervalQuote;
  year: IntervalQuote;
};

type Props = {
  subscriptionStatus: string | null;
  planTier: string | null;
  trialEndsAt: string | null;
  hasStripeCustomer: boolean;
};

function normalizeTier(t: string | null): string | null {
  if (!t) return null;
  return t === "starter" ? "agency_basic" : t;
}

export function StripeBillingSection({
  subscriptionStatus,
  planTier,
  trialEndsAt,
  hasStripeCustomer,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<AgencyPlanId | "portal" | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [quotes, setQuotes] = useState<PlanQuoteRow[] | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setQuotesError(null);
      try {
        const res = await fetch("/api/stripe/plan-prices", { method: "GET" });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          plans?: PlanQuoteRow[];
        };
        if (!res.ok) {
          if (!cancelled) {
            setQuotesError(data.error ?? `Greška ${res.status}`);
            setQuotes([]);
          }
          return;
        }
        if (!cancelled) {
          setQuotes(data.plans ?? []);
        }
      } catch {
        if (!cancelled) {
          setQuotesError("Ne mogu da učitam cene.");
          setQuotes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function quoteFor(planId: AgencyPlanId): PlanQuoteRow | undefined {
    return quotes?.find((q) => q.planId === planId);
  }

  function priceLabel(planId: AgencyPlanId): string {
    const q = quoteFor(planId);
    if (!q) return "—";
    const part = interval === "month" ? q.month : q.year;
    if (!part?.formatted || part.formatted === "—") return "—";
    const suffix = interval === "month" ? "/mes" : "/god";
    return `${part.formatted} ${suffix}`;
  }

  async function checkout(planId: AgencyPlanId) {
    setError(null);
    setLoading(planId);
    try {
      const res = await fetch("/api/stripe/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingInterval: interval }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Greška ${res.status}`);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Neočekivan odgovor servera.");
    } finally {
      setLoading(null);
    }
  }

  async function onPortal() {
    setError(null);
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Greška ${res.status}`);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Neočekivan odgovor servera.");
    } finally {
      setLoading(null);
    }
  }

  const tierNorm = normalizeTier(planTier);
  const currentPlanLabel =
    AGENCY_PLANS.find((p) => p.id === tierNorm)?.nameSr ?? planTier ?? "—";

  return (
    <section className="bzr-card mt-2">
      <p className="bzr-eyebrow">Billing</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
        Pretplata agencije
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
        Plaća <strong className="text-ink">vlasnik agencije</strong>; saradnici i
        terenski radnici koriste istu pretplatu dok god agencija ima slobodna
        mesta po planu.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/15 bg-bg/40 px-3.5 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">
            Status
          </dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {subscriptionStatus ?? "—"}
          </dd>
        </div>
        <div className="rounded-xl border border-border/15 bg-bg/40 px-3.5 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">
            Plan
          </dt>
          <dd className="mt-1 text-sm font-medium text-ink">{currentPlanLabel}</dd>
        </div>
        {trialEndsAt ? (
          <div className="rounded-xl border border-border/15 bg-bg/40 px-3.5 py-3 sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">
              Trial do
            </dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {new Date(trialEndsAt).toLocaleString("sr-Latn-RS")}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink/70">Period naplate</span>
        <div className="bzr-tabs" role="group" aria-label="Period naplate">
          <button
            type="button"
            onClick={() => setInterval("month")}
            aria-selected={interval === "month"}
            className="bzr-tab"
          >
            Mesečno
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            aria-selected={interval === "year"}
            className="bzr-tab"
          >
            Godišnje
          </button>
        </div>
      </div>

      {quotesError ? (
        <p className="mt-4 text-sm text-warning" role="status">
          Cene nisu učitane: {quotesError}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {AGENCY_PLANS.map((p) => (
          <li key={p.id} className="bzr-stat flex flex-col !py-4">
            <h3 className="font-semibold tracking-tight text-ink">{p.nameSr}</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-ink/65">
              {p.descriptionSr}
            </p>
            <p className="mt-3 text-xl font-bold tabular-nums text-ink">
              {quotes === null && !quotesError ? "Učitavanje…" : priceLabel(p.id)}
            </p>
            <p className="mt-1 text-[11px] text-ink/45">
              Iznos iz Stripe cene (Price ID iz .env).
            </p>
            <button
              type="button"
              disabled={
                loading !== null || (quotes === null && quotesError == null)
              }
              onClick={() => checkout(p.id)}
              className="bzr-btn-primary bzr-btn-sm mt-4 w-full"
            >
              {loading === p.id ? "Otvaranje…" : "Izaberi i plati"}
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {hasStripeCustomer ? (
        <div className="mt-6 border-t border-border/15 pt-5">
          <button
            type="button"
            disabled={loading !== null}
            onClick={onPortal}
            className="bzr-btn-secondary"
          >
            {loading === "portal" ? "Otvaranje…" : "Stripe korisnički portal"}
          </button>
          <p className="mt-2 text-xs text-ink/55">
            U portalu možeš promeniti način plaćanja ili (ako je uključeno u Stripe)
            zameniti plan.
          </p>
        </div>
      ) : null}
    </section>
  );
}
