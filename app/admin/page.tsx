import Link from "next/link";

import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";

import { getUserLocale } from "@/lib/i18n/server";

import { getMessages } from "@/lib/i18n";

import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";



export const dynamic = "force-dynamic";



export default async function AdminHomePage() {

  await assertSuperAdminUser();

  const locale = await getUserLocale();

  const m = getMessages(locale);

  const h = m.admin.home;

  const db = getAdminDbOrNull();



  let agencyCount: number | null = null;

  let userCount: number | null = null;



  if (db) {

    const [{ count: ac }, { count: uc }] = await Promise.all([

      db.admin.from("agencies").select("id", { count: "exact", head: true }),

      db.admin.from("profiles").select("user_id", { count: "exact", head: true }),

    ]);

    agencyCount = ac ?? null;

    userCount = uc ?? null;

  }



  return (

    <main className="relative isolate min-h-[32rem]">

      <PageCornerDecor kind="halftone" variant="canvas" />

      <BackButton href="/dashboard" className="relative mb-3" />

      <h1 className="relative text-2xl font-bold text-ink">{h.title}</h1>

      <p className="relative mt-2 max-w-xl text-sm text-ink/75">{h.intro}</p>



      {!db ? (

        <p className="relative mt-6 rounded border border-warning/40 bg-[rgb(var(--color-warning-bg))] px-4 py-3 text-sm text-warning">

          {h.noServiceRole}

        </p>

      ) : (

        <dl className="relative mt-8 grid max-w-md gap-4 text-sm sm:grid-cols-2">

          <div className="border border-ink/20 p-4">

            <dt className="font-medium text-ink/70">{h.agenciesCount}</dt>

            <dd className="mt-1 text-2xl font-semibold tabular-nums">

              {agencyCount ?? m.common.noData}

            </dd>

          </div>

          <div className="border border-ink/20 p-4">

            <dt className="font-medium text-ink/70">{h.usersCount}</dt>

            <dd className="mt-1 text-2xl font-semibold tabular-nums">

              {userCount ?? m.common.noData}

            </dd>

          </div>

        </dl>

      )}



      <ul className="relative mt-10 space-y-2 text-sm font-medium">

        <li>

          <Link

            href="/admin/agencies"

            className="text-ink underline underline-offset-4"

          >

            {h.linkAgencies}

          </Link>

        </li>

        <li>

          <Link

            href="/admin/users"

            className="text-ink underline underline-offset-4"

          >

            {h.linkUsers}

          </Link>

        </li>

        <li>

          <Link

            href="/admin/audit"

            className="text-ink underline underline-offset-4"

          >

            {h.linkAudit}

          </Link>

        </li>

      </ul>

    </main>

  );

}

