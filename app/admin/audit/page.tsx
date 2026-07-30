import { assertSuperAdminUser, getAdminDbOrNull } from "@/lib/admin/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

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
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const a = m.admin.audit;
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
    <main className="relative isolate min-h-[32rem]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <BackButton href="/admin" className="mb-3" />
          <h1 className="text-2xl font-bold text-ink">{a.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">{a.intro}</p>
        </div>
      </div>

      {!db ? (
        <p className="mt-6 text-sm text-warning">
          {a.noServiceRole}{" "}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {db && !loadError ? (
        <div className="relative mt-6 overflow-x-auto rounded-xl border border-border/25 shadow-card">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/25 bg-surface-2">
                <th className="px-3 py-2 font-semibold">{a.colTime}</th>
                <th className="px-3 py-2 font-semibold">{a.colAction}</th>
                <th className="px-3 py-2 font-semibold">{a.colEntity}</th>
                <th className="px-3 py-2 font-semibold">{a.colId}</th>
                <th className="px-3 py-2 font-semibold">{a.colActor}</th>
                <th className="px-3 py-2 font-semibold">{a.colMeta}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-ink/60">
                    {a.noRecords}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink/15 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-ink/80">
                      {new Date(r.created_at).toLocaleString(
                        locale === "en" ? "en-GB" : "sr-Latn-RS",
                      )}
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
