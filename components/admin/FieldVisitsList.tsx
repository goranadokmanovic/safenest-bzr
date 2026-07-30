"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRecords, deleteRecord } from "@/lib/offline/indexedDB";
import { removeFromQueue } from "@/lib/offline/syncQueue";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  formatDurationHours,
  formatVisitDate,
  mapLegacyOfflineVisitData,
  metaStr,
  truncateText,
} from "@/lib/field-visits/display";
import type { FieldVisitMetadata } from "@/lib/field-visits/types";

export type FieldVisitServerRow = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  scheduled_at: string;
  notes: string | null;
  metadata: FieldVisitMetadata;
  created_at: string;
  status: string;
  sync_status: string;
};

export type FieldVisitDisplayRow = FieldVisitServerRow & {
  isLocal: boolean;
  localId?: string;
};

function isSynced(syncStatus: string | null | undefined): boolean {
  return syncStatus === "synced";
}

async function deleteLocalVisit(localId: string): Promise<void> {
  await deleteRecord("field_visits", localId);
  await removeFromQueue(`field_visits:${localId}`);

  const photos = await getRecords<{ field_visit_local_id: string }>(
    "field_photos",
  );
  for (const p of photos) {
    if (p.data.field_visit_local_id === localId) {
      await deleteRecord("field_photos", p.id);
    }
  }
}

export function FieldVisitsList({
  serverRows,
  clientNames,
}: {
  serverRows: FieldVisitServerRow[];
  clientNames: Record<string, string>;
}) {
  const router = useRouter();
  const { m, locale } = useTranslations();
  const fv = m.admin.fieldVisits;
  const [localRows, setLocalRows] = useState<FieldVisitDisplayRow[]>([]);
  const [viewRow, setViewRow] = useState<FieldVisitDisplayRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<FieldVisitDisplayRow | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    try {
      const records = await getRecords<Record<string, unknown>>("field_visits");
      const unsynced = records.filter((r) => !r.synced);
      setLocalRows(
        unsynced.map((r) => {
          const mapped = mapLegacyOfflineVisitData(r.data);
          return {
            id: r.id,
            localId: r.id,
            isLocal: true,
            client_company_id: mapped.client_company_id,
            client_name:
              clientNames[mapped.client_company_id] ??
              mapped.client_company_id.slice(0, 8),
            scheduled_at: mapped.scheduled_at,
            notes: mapped.notes,
            metadata: mapped.metadata,
            created_at: new Date(r.createdAt).toISOString(),
            status: mapped.status,
            sync_status: "pending",
          };
        }),
      );
    } catch {
      setLocalRows([]);
    }
  }, [clientNames]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal, serverRows]);

  const rows = useMemo(() => {
    const server: FieldVisitDisplayRow[] = serverRows.map((r) => ({
      ...r,
      isLocal: false,
    }));
    return [...localRows, ...server].sort(
      (a, b) =>
        new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );
  }, [serverRows, localRows]);

  async function confirmDelete(row: FieldVisitDisplayRow) {
    setLoading(true);
    setError(null);
    try {
      if (row.isLocal && row.localId) {
        await deleteLocalVisit(row.localId);
        await loadLocal();
      } else {
        const res = await fetch(`/api/admin/field-visits/${row.id}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? m.common.error);
          return;
        }
        router.refresh();
      }
      setDeleteRow(null);
    } catch {
      setError(m.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-8 text-sm text-ink/70">{fv.noVisits}</p>
    );
  }

  return (
    <>
      {error && !deleteRow && !viewRow ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 overflow-x-auto rounded-xl border border-border/25 shadow-card">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/25 bg-surface-2">
              <th className="px-3 py-2 font-semibold">{fv.colClient}</th>
              <th className="px-3 py-2 font-semibold">{fv.colDate}</th>
              <th className="px-3 py-2 font-semibold">{fv.colDuration}</th>
              <th className="px-3 py-2 font-semibold">{fv.colRisk}</th>
              <th className="px-3 py-2 font-semibold">{fv.colStatus}</th>
              <th className="px-3 py-2 font-semibold">{fv.colNotes}</th>
              <th className="px-3 py-2 font-semibold">{m.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = row.metadata ?? {};
              const synced = row.isLocal ? false : isSynced(row.sync_status);
              return (
                <tr key={row.isLocal ? `local-${row.id}` : row.id}>
                  <td className="px-3 py-2">{row.client_name ?? m.common.noData}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatVisitDate(row.scheduled_at, locale)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDurationHours(meta, fv.hours) ?? m.common.noData}
                  </td>
                  <td className="px-3 py-2">
                    {metaStr(meta, "risk_level") ?? m.common.noData}
                  </td>
                  <td className="px-3 py-2">
                    {synced ? (
                      <span className="bzr-badge-success">
                        <span aria-hidden>●</span> {fv.synced}
                      </span>
                    ) : (
                      <span className="bzr-badge-danger">
                        <span aria-hidden>●</span> {fv.waitingSync}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 text-ink/80">
                    {truncateText(row.notes, 50)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setViewRow(row)}
                        className="rounded-lg border border-border/40 px-2 py-0.5 text-xs"
                      >
                        {fv.details}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteRow(row)}
                        className="border border-red-800 px-2 py-0.5 text-xs text-red-800"
                      >
                        {m.common.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border/40 bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-semibold">{fv.detailsTitle}</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailClient}
                </dt>
                <dd>{viewRow.client_name ?? m.common.noData}</dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailDate}
                </dt>
                <dd>{formatVisitDate(viewRow.scheduled_at, locale)}</dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailDuration}
                </dt>
                <dd>
                  {formatDurationHours(viewRow.metadata, ` ${fv.hours}`) ??
                    m.common.noData}
                </dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailRisk}
                </dt>
                <dd>{metaStr(viewRow.metadata, "risk_level") ?? m.common.noData}</dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailVisitStatus}
                </dt>
                <dd>{viewRow.status}</dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailSync}
                </dt>
                <dd>
                  {viewRow.isLocal || !isSynced(viewRow.sync_status)
                    ? fv.syncWaitingDetail
                    : fv.syncSyncedDetail}
                </dd>
              </div>
              <div className="flex gap-2 border-b border-ink/10 py-1">
                <dt className="w-32 shrink-0 font-medium text-ink/70">
                  {fv.detailCreated}
                </dt>
                <dd>{formatVisitDate(viewRow.created_at, locale)}</dd>
              </div>
              <div className="py-1">
                <dt className="font-medium text-ink/70">{fv.detailNotes}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink/90">
                  {viewRow.notes?.trim() || m.common.noData}
                </dd>
              </div>
              {metaStr(viewRow.metadata, "extracted_text") ? (
                <div className="py-1">
                  <dt className="font-medium text-ink/70">{fv.detailOcr}</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded border border-ink/20 bg-ink/[0.02] p-2 text-xs">
                    {metaStr(viewRow.metadata, "extracted_text")}
                  </dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              onClick={() => setViewRow(null)}
              className="mt-6 rounded-lg border border-border/40 px-4 py-1.5 text-sm"
            >
              {fv.close}
            </button>
          </div>
        </div>
      ) : null}

      {deleteRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border/40 bg-surface p-6 shadow-lg">
            <h3 className="font-semibold">{fv.deleteTitle}</h3>
            <p className="mt-2 text-sm text-ink/80">
              {deleteRow.isLocal ? fv.deleteLocal : fv.deleteServer}
            </p>
            {error ? (
              <p className="mt-2 text-sm text-red-700">{error}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmDelete(deleteRow)}
                className="border border-red-800 bg-red-50 px-4 py-1.5 text-sm font-semibold text-red-900"
              >
                {loading ? m.common.loading : m.common.delete}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteRow(null);
                  setError(null);
                }}
                className="rounded-lg border border-border/40 px-4 py-1.5 text-sm"
              >
                {m.common.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
