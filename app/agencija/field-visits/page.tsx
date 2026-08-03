import Link from "next/link";
import { Suspense } from "react";
import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import {
  FieldVisitsList,
  type FieldVisitServerRow,
} from "@/components/field-visits/FieldVisitsList";
import {
  listAgencyWorkers,
  listFieldVisitsForAgency,
} from "@/lib/field-visits/list";
import { applyClientScope, clientIdsInScope } from "@/lib/api/client-scope";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

const VISIT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  searchParams: Promise<{
    visit?: string;
    from?: string;
    scope?: string;
    time?: string;
  }>;
};

export default async function AgencijaTerenskePosetePage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const deepLinkVisitId =
    typeof sp.visit === "string" && VISIT_ID_RE.test(sp.visit)
      ? sp.visit
      : null;
  const deepLinkFrom =
    typeof sp.from === "string" && sp.from.trim() ? sp.from.trim() : null;
  /** Hide list chrome so calendar → detail never flashes Terenske posete. */
  const deepLinkMode = Boolean(deepLinkVisitId);

  const { agency_id, user, role } = await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const fv = m.dashboard.fieldVisits;

  const supabase = await createServerSupabaseClient();

  let visits: FieldVisitServerRow[] = [];
  let clientNames: Record<string, string> = {};
  let loadError: string | null = null;

  const workersPromise = listAgencyWorkers(supabase, agency_id);

  const [{ rows, error }, workers] = await Promise.all([
    deepLinkMode
      ? Promise.resolve({ rows: [] as FieldVisitServerRow[], error: null })
      : listFieldVisitsForAgency(supabase, agency_id, user.id, {
          scope: "mine",
          time: "upcoming",
        }),
    workersPromise,
  ]);

  if (error) {
    loadError = error;
  } else {
    visits = rows;
    for (const v of rows) {
      if (v.client_name && v.client_company_id) {
        clientNames[v.client_company_id] = v.client_name;
      }
    }
  }

  const visible = await clientIdsInScope(supabase, {
    user_id: user.id,
    role,
    agency_id,
  });

  const { data: clients } = await applyClientScope(
    supabase
      .from("client_companies")
      .select("id, name")
      .eq("agency_id", agency_id)
      .is("archived_at", null),
    visible.ok ? visible.clientIds : [],
  );

  for (const c of clients ?? []) {
    clientNames[c.id] = c.name;
  }

  return (
    <main className="bzr-field-visits-page relative isolate min-h-[calc(100vh-8rem)] space-y-8">
      <PageCornerDecor kind="halftone" variant="canvas" />

      {!deepLinkMode ? (
        <div className="bzr-page-header bzr-field-visits-header">
          <div className="min-w-0">
            <BackButton href="/agencija" className="mb-3" />
            <p className="bzr-eyebrow">Terenski rad</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              {fv.title}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink/65">
              {fv.intro}
            </p>
          </div>
          <Link
            href="/agencija/field-visits/new"
            className="bzr-field-visit-cta"
          >
            <span className="bzr-field-visit-cta__plus" aria-hidden>
              +
            </span>
            <span>{fv.newVisit}</span>
            <span className="bzr-field-visit-cta__spark" aria-hidden>
              ✦
            </span>
          </Link>
        </div>
      ) : null}

      {loadError ? (
        <p
          className="rounded-xl border border-danger/30 bg-[rgb(var(--color-danger-bg))] px-4 py-3 text-base text-danger"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {!loadError ? (
        <Suspense
          fallback={
            deepLinkMode ? (
              <p className="py-16 text-center text-sm text-ink/55" role="status">
                {fv.deepLinkLoading}
              </p>
            ) : null
          }
        >
          <FieldVisitsList
            serverRows={visits}
            clientNames={clientNames}
            currentUserId={user.id}
            workers={workers}
            deepLinkVisitId={deepLinkVisitId}
            deepLinkFrom={deepLinkFrom}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
