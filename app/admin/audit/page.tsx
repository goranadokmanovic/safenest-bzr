import Link from "next/link";
import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
};

export default async function AdminAuditPage() {
  await assertSuperAdminUser();
  const db = getAdminDbOrNull();

  let rows: AuditRow[] = [];
  let loadError: string | null = null;

  if (db) {
    const { data, error } = await db.admin
      .from("admin_audit_log")
      .select("id, created_at, actor_user_id, action, entity_type, entity_id, metadata")
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) {
      loadError = error.message;
    } else {
      rows = (data ?? []) as AuditRow[];
    }
  }

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Audit log</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">
            Poslednjih 150 admin akcija. Tabela{" "}
            <code className="font-mono text-xs">admin_audit_log</code> mora
            postojati (migracija u projektu).
          </p>
        </div>
        <Link href="/admin" className="text-sm underline">
          ← Admin početna
        </Link>
      </div>

      {!db ? (
        <p className="mt-6 text-sm text-amber-800">
          Nema <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {db && !loadError ? (
        <div className="mt-6 overflow-x-auto border border-ink/30">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink bg-ink/[0.04]">
                <th className="px-3 py-2 font-semibold">Vreme</th>
                <th className="px-3 py-2 font-semibold">Akcija</th>
                <th className="px-3 py-2 font-semibold">Entitet</th>
                <th className="px-3 py-2 font-semibold">Id</th>
                <th className="px-3 py-2 font-semibold">Actor</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-ink/60">
                    Nema zapisa. Izvrši SQL migraciju za{" "}
                    <code className="font-mono text-xs">admin_audit_log</code> pa
                    ponovo pokreni akcije u adminu.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink/15 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-ink/80">
                      {new Date(r.created_at).toLocaleString("sr-Latn-RS")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.entity_type}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink/70">
                      {r.entity_id.slice(0, 10)}…
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink/60">
                      {r.actor_user_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-[11px] text-ink/70" title={JSON.stringify(r.metadata ?? {})}>
                      {JSON.stringify(r.metadata ?? {})}
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
