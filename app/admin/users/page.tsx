import Link from "next/link";
import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfileRoleEdit } from "@/components/admin/profile-role-edit";
import { ProfileAgencyAssign } from "@/components/admin/profile-agency-assign";
import { UserDeleteButton } from "@/components/admin/user-delete-button";

export const dynamic = "force-dynamic";

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  agency_id: string | null;
  client_company_id: string | null;
  locale: string | null;
};

export default async function AdminUsersPage() {
  await assertSuperAdminUser();
  const db = getAdminDbOrNull();

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";

  let rows: ProfileRow[] = [];
  let loadError: string | null = null;
  let agencyOptions: { id: string; name: string }[] = [];

  if (db) {
    const [{ data, error }, agRes] = await Promise.all([
      db.admin
        .from("profiles")
        .select(
          "user_id, email, full_name, role, agency_id, client_company_id, locale",
        )
        .order("email", { ascending: true })
        .limit(300),
      db.admin.from("agencies").select("id, name").order("name").limit(500),
    ]);

    if (error) {
      loadError = error.message;
    } else {
      rows = (data ?? []) as ProfileRow[];
    }
    if (!agRes.error && agRes.data) {
      agencyOptions = agRes.data as { id: string; name: string }[];
    }
  }

  const agencyIds = Array.from(
    new Set(
      rows
        .map((r) => r.agency_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const agencyNames = new Map<string, string>();
  for (const o of agencyOptions) {
    agencyNames.set(o.id, o.name);
  }
  if (db && agencyIds.length > 0) {
    const missing = agencyIds.filter((id) => !agencyNames.has(id));
    if (missing.length > 0) {
      const { data: ag } = await db.admin
        .from("agencies")
        .select("id, name")
        .in("id", missing);
      for (const a of ag ?? []) {
        agencyNames.set(a.id as string, a.name as string);
      }
    }
  }

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Korisnici</h1>
          <p className="mt-1 text-sm text-ink/70">
            Uloga, dodela agencije i brisanje naloga. Sve izmene zahtevaju
            potvrdu čekboksom; brisanje i fraza u modalu.
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
          <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink bg-ink/[0.04]">
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Ime</th>
                <th className="px-3 py-2 font-semibold">Uloga / agencija</th>
                <th className="px-3 py-2 font-semibold">Agencija (naziv)</th>
                <th className="px-3 py-2 font-semibold">Jezik</th>
                <th className="px-3 py-2 font-semibold">user_id</th>
                <th className="px-3 py-2 font-semibold">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-ink/60">
                    Nema profila.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-ink/15">
                    <td className="px-3 py-2 align-top">{r.email}</td>
                    <td className="px-3 py-2 align-top">{r.full_name ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <ProfileRoleEdit
                        userId={r.user_id}
                        role={r.role}
                        currentUserId={currentUserId}
                      />
                      <ProfileAgencyAssign
                        key={`${r.user_id}-${r.agency_id ?? ""}`}
                        userId={r.user_id}
                        agencyId={r.agency_id}
                        agencies={agencyOptions}
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-ink/90">
                      {r.agency_id
                        ? (agencyNames.get(r.agency_id) ?? `${r.agency_id.slice(0, 8)}…`)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">{r.locale ?? "—"}</td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-ink/60">
                      {r.user_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 align-top">
                      <UserDeleteButton
                        userId={r.user_id}
                        email={r.email}
                        disabled={r.user_id === currentUserId}
                      />
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
