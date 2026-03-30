"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGENCY_PLANS } from "@/lib/plans/catalog";

const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;

function isSubscriptionStatus(
  s: string | null | undefined,
): s is (typeof SUBSCRIPTION_STATUSES)[number] {
  return (
    s != null &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(s)
  );
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type AgencyEditProps = {
  agencyId: string;
  subscriptionStatus: string | null;
  planTier: string | null;
  trialEndsAt: string | null;
};

export function AgencySubscriptionEdit({
  agencyId,
  subscriptionStatus,
  planTier,
  trialEndsAt,
}: AgencyEditProps) {
  const router = useRouter();
  const [sub, setSub] = useState<string>(
    isSubscriptionStatus(subscriptionStatus) ? subscriptionStatus : "trialing",
  );
  const initialPlan =
    planTier === "starter" || !planTier ? "agency_basic" : planTier;
  const [plan, setPlan] = useState(initialPlan);
  const [trialLocal, setTrialLocal] = useState(() =>
    toDatetimeLocalValue(trialEndsAt),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState(false);

  async function save() {
    setMsg(null);
    setLoading(true);
    try {
      let trial_ends_at: string | null = null;
      if (trialLocal.trim()) {
        const d = new Date(trialLocal);
        if (Number.isNaN(d.getTime())) {
          setMsg("Neispravan datum/trial.");
          setLoading(false);
          return;
        }
        trial_ends_at = d.toISOString();
      }

      const res = await fetch(`/api/admin/agencies/${agencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_status: sub,
          plan_tier: plan.trim() || "starter",
          trial_ends_at,
          acknowledge: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg(json.error ?? `Greška ${res.status}`);
        return;
      }
      setMsg("Sačuvano.");
      setAck(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-2 py-1">
      <select
        value={sub}
        onChange={(e) => setSub(e.target.value)}
        className="w-full border border-ink/40 bg-white px-2 py-1 text-xs text-ink"
        aria-label="Status pretplate"
      >
        {SUBSCRIPTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={
          AGENCY_PLANS.some((p) => p.id === plan) ? plan : "agency_basic"
        }
        onChange={(e) => setPlan(e.target.value)}
        className="w-full border border-ink/40 bg-white px-2 py-1 text-xs font-mono text-ink"
        aria-label="Plan"
      >
        {!AGENCY_PLANS.some((p) => p.id === plan) ? (
          <option value={plan}>{plan} (u bazi)</option>
        ) : null}
        {AGENCY_PLANS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} — {p.nameSr}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={trialLocal}
        onChange={(e) => setTrialLocal(e.target.value)}
        className="w-full border border-ink/40 px-2 py-1 text-xs"
        aria-label="Trial do"
      />
      <label className="flex cursor-pointer items-start gap-2 text-[11px] text-ink/80">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5"
        />
        <span>Potvrđujem izmenu pretplate za ovu agenciju.</span>
      </label>
      <button
        type="button"
        disabled={loading || !ack}
        onClick={save}
        className="border border-ink bg-accent px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50"
      >
        {loading ? "…" : "Sačuvaj"}
      </button>
      {msg ? (
        <p
          className={
            msg === "Sačuvano." ? "text-xs text-green-800" : "text-xs text-red-700"
          }
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
