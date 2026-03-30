import Link from "next/link";
import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await assertSuperAdminUser();
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
    <main>
      <h1 className="text-2xl font-bold text-ink">Admin početna</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/75">
        Pregled svih agencija i korisnika. Za liste je potreban{" "}
        <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> u{" "}
        <code className="font-mono text-xs">.env.local</code>.
      </p>

      {!db ? (
        <p className="mt-6 rounded border border-amber-600/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Service role ključ nije podešen — brojači i tabele neće raditi dok ne
          dodaš <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> i
          restartuješ server.
        </p>
      ) : (
        <dl className="mt-8 grid max-w-md gap-4 text-sm sm:grid-cols-2">
          <div className="border border-ink/20 p-4">
            <dt className="font-medium text-ink/70">Agencije</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {agencyCount ?? "—"}
            </dd>
          </div>
          <div className="border border-ink/20 p-4">
            <dt className="font-medium text-ink/70">Profili (korisnici)</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {userCount ?? "—"}
            </dd>
          </div>
        </dl>
      )}

      <ul className="mt-10 space-y-2 text-sm font-medium">
        <li>
          <Link
            href="/admin/agencies"
            className="text-ink underline underline-offset-4"
          >
            Agencije (pregled + izmena pretplate) →
          </Link>
        </li>
        <li>
          <Link
            href="/admin/users"
            className="text-ink underline underline-offset-4"
          >
            Korisnici (pregled + izmena uloge) →
          </Link>
        </li>
        <li>
          <Link
            href="/admin/audit"
            className="text-ink underline underline-offset-4"
          >
            Audit log →
          </Link>
        </li>
      </ul>
    </main>
  );
}
