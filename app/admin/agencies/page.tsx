import Link from "next/link";
import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";
import { AgencySubscriptionEdit } from "@/components/admin/agency-subscription-edit";
import { AgencyDeleteButton } from "@/components/admin/agency-delete-button";

export const dynamic = "force-dynamic";

type AgencyRow = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string | null;
  plan_tier: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export default async function AdminAgenciesPage() {
  await assertSuperAdminUser();
  const db = getAdminDbOrNull();

  let agencies: AgencyRow[] = [];
  let loadError: string | null = null;

  if (db) {
    const { data, error } = await db.admin
      .from("agencies")
      .select(
        "id, name, slug, subscription_status, plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id",
      )
      .order("name", { ascending: true })
      .limit(200);

    if (error) {
      loadError = error.message;
    } else {
      agencies = (data ?? []) as AgencyRow[];
    }
  }

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Agencije</h1>
          <p className="mt-1 text-sm text-ink/70">
            Pregled i izmena pretplate (max 200). Zahteva{" "}
            <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        </div>
        <Link href="/admin" className="text-sm underline">
          ← Admin početna
        </Link>
      </div>

      {!db ? (
        <p className="mt-6 text-sm text-amber-800">
          Nema <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> —
          lista se ne može učitati.
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {db && !loadError ? (
        <div className="mt-6 overflow-x-auto border border-ink/30">
          <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink bg-ink/[0.04]">
                <th className="px-3 py-2 font-semibold">Naziv</th>
                <th className="px-3 py-2 font-semibold">Slug</th>
                <th className="px-3 py-2 font-semibold">Stripe</th>
                <th className="px-3 py-2 font-semibold">Izmena pretplate</th>
              </tr>
            </thead>
            <tbody>
              {agencies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-ink/60">
                    Nema agencija.
                  </td>
                </tr>
              ) : (
                agencies.map((a) => (
                  <tr key={a.id} className="border-b border-ink/15">
                    <td className="px-3 py-2 font-medium align-top">{a.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/80 align-top">
                      {a.slug}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink/70 align-top">
                      {a.stripe_customer_id
                        ? `${a.stripe_customer_id.slice(0, 14)}…`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <AgencySubscriptionEdit
                        agencyId={a.id}
                        subscriptionStatus={a.subscription_status}
                        planTier={a.plan_tier}
                        trialEndsAt={a.trial_ends_at}
                      />
                      <AgencyDeleteButton agencyId={a.id} agencyName={a.name} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
