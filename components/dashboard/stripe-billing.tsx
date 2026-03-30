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
    <section className="mt-10 border-t border-ink/20 pt-8">
      <h2 className="text-lg font-semibold text-ink">Pretplata agencije (Stripe)</h2>
      <p className="mt-2 max-w-xl text-sm text-ink/75">
        Plaća <strong>vlasnik agencije</strong>; saradnici i terenski radnici koriste
        istu pretplatu dok god agencija ima slobodna mesta po planu.
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2 border-b border-ink/10 py-2">
          <dt className="w-40 font-medium text-ink">Status</dt>
          <dd className="text-ink/90">{subscriptionStatus ?? "—"}</dd>
        </div>
        <div className="flex gap-2 border-b border-ink/10 py-2">
          <dt className="w-40 font-medium text-ink">Plan</dt>
          <dd className="text-ink/90">{currentPlanLabel}</dd>
        </div>
        {trialEndsAt ? (
          <div className="flex gap-2 border-b border-ink/10 py-2">
            <dt className="w-40 font-medium text-ink">Trial do</dt>
            <dd className="text-ink/90">
              {new Date(trialEndsAt).toLocaleString("sr-Latn-RS")}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-ink/15 pb-4">
        <span className="text-sm font-medium text-ink">Period naplate:</span>
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={`border px-3 py-1.5 text-sm ${
            interval === "month"
              ? "border-ink bg-accent font-semibold text-ink"
              : "border-ink/40 bg-surface text-ink"
          }`}
        >
          Mesečno
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`border px-3 py-1.5 text-sm ${
            interval === "year"
              ? "border-ink bg-accent font-semibold text-ink"
              : "border-ink/40 bg-surface text-ink"
          }`}
        >
          Godišnje
        </button>
      </div>

      {quotesError ? (
        <p className="mt-4 text-sm text-amber-900" role="status">
          Cene nisu učitane: {quotesError}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {AGENCY_PLANS.map((p) => (
          <li
            key={p.id}
            className="flex flex-col border border-ink/30 bg-surface p-4"
          >
            <h3 className="font-semibold text-ink">{p.nameSr}</h3>
            <p className="mt-2 flex-1 text-xs text-ink/80">{p.descriptionSr}</p>
            <p className="mt-3 text-lg font-bold tabular-nums text-ink">
              {quotes === null && !quotesError ? "Učitavanje…" : priceLabel(p.id)}
            </p>
            <p className="mt-1 text-[11px] text-ink/55">
              Iznos iz Stripe cene (Price ID iz .env).
            </p>
            <button
              type="button"
              disabled={
                loading !== null || (quotes === null && quotesError == null)
              }
              onClick={() => checkout(p.id)}
              className="mt-4 border border-ink bg-accent px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
            >
              {loading === p.id ? "Otvaranje…" : "Izaberi i plati"}
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {hasStripeCustomer ? (
        <div className="mt-6">
          <button
            type="button"
            disabled={loading !== null}
            onClick={onPortal}
            className="border border-ink bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {loading === "portal" ? "Otvaranje…" : "Stripe korisnički portal"}
          </button>
          <p className="mt-2 text-xs text-ink/60">
            U portalu možeš promeniti način plaćanja ili (ako je uključeno u Stripe)
            zameniti plan.
          </p>
        </div>
      ) : null}
    </section>
  );
}
