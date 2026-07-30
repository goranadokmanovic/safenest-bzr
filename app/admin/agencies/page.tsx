import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { AgencySubscriptionEdit } from "@/components/admin/agency-subscription-edit";
import { AgencyDeleteButton } from "@/components/admin/agency-delete-button";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

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
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const ag = m.admin.agencies;
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
    <main className="relative isolate min-h-[32rem]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <BackButton href="/admin" className="mb-3" />
          <h1 className="text-2xl font-bold text-ink">{ag.title}</h1>
          <p className="mt-1 text-sm text-ink/70">{ag.intro}</p>
        </div>
      </div>

      {!db ? (
        <p className="mt-6 text-sm text-warning">{ag.noServiceRole}</p>
      ) : null}

      {loadError ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {db && !loadError ? (
        <div className="relative mt-6 overflow-x-auto rounded-xl border border-border/25 shadow-card">
          <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/25 bg-surface-2">
                <th className="px-3 py-2 font-semibold">{ag.colName}</th>
                <th className="px-3 py-2 font-semibold">{ag.colSlug}</th>
                <th className="px-3 py-2 font-semibold">{ag.colStripe}</th>
                <th className="px-3 py-2 font-semibold">{ag.colSubscriptionEdit}</th>
              </tr>
            </thead>
            <tbody>
              {agencies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-ink/60">
                    {ag.noAgencies}
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
