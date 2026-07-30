"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { ComplianceRecordForm } from "@/components/agencija/ComplianceRecordForm";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  getComplianceStatus,
  type ComplianceRecord,
  type ComplianceRecordType,
  type ComplianceStatusKind,
} from "@/lib/compliance/types";

const SECTION_TYPES: ComplianceRecordType[] = [
  "medical_exam",
  "training_certification",
  "equipment_check",
];

const STATUS_CLASS: Record<ComplianceStatusKind, string> = {
  missing: "bg-ink/15 text-ink/80 ring-1 ring-ink/20",
  expired: "bg-red-600 text-white ring-1 ring-red-800/40",
  expiring: "bg-amber-500 text-white ring-1 ring-amber-700/35",
  valid: "bg-emerald-600 text-white ring-1 ring-emerald-800/35",
};

type Props = {
  clientCompanyId: string;
  clientName: string;
  /** Filtrira worker-zapise na ovog radnika (?worker_id=). */
  focusWorkerId?: string | null;
  onClearWorkerFocus?: () => void;
};

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
      locale === "en" ? "en-US" : "sr-RS",
      { timeZone: "UTC" },
    );
  } catch {
    return iso;
  }
}

export function ComplianceRecordsPanel({
  clientCompanyId,
  clientName,
  focusWorkerId = null,
  onClearWorkerFocus,
}: Props) {
  const { m, locale } = useTranslations();
  const c = m.agencija.compliance;
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formType, setFormType] = useState<ComplianceRecordType | null>(null);
  const [editing, setEditing] = useState<ComplianceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/compliance-records?client_company_id=${encodeURIComponent(clientCompanyId)}`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        records?: ComplianceRecord[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setRecords(json.records ?? []);
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [clientCompanyId, m.common.error, m.common.networkError]);

  useEffect(() => {
    void load();
  }, [load]);

  const [focusWorkerName, setFocusWorkerName] = useState<string | null>(null);

  useEffect(() => {
    if (!focusWorkerId) {
      setFocusWorkerName(null);
      return;
    }
    const fromRecords = records.find(
      (r) => r.subject_type === "worker" && r.subject_id === focusWorkerId,
    )?.subject_name;
    if (fromRecords) {
      setFocusWorkerName(fromRecords);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/employees/${focusWorkerId}`);
        const json = (await res.json().catch(() => ({}))) as {
          employee?: { first_name?: string; last_name?: string };
        };
        if (cancelled || !res.ok || !json.employee) return;
        const name =
          `${json.employee.last_name ?? ""} ${json.employee.first_name ?? ""}`.trim();
        if (name) setFocusWorkerName(name);
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusWorkerId, records]);

  const grouped = useMemo(() => {
    const map: Record<ComplianceRecordType, ComplianceRecord[]> = {
      medical_exam: [],
      training_certification: [],
      equipment_check: [],
    };
    for (const r of records) {
      if (!(r.record_type in map)) continue;
      if (
        focusWorkerId &&
        r.subject_type === "worker" &&
        r.subject_id !== focusWorkerId
      ) {
        continue;
      }
      map[r.record_type].push(r);
    }
    return map;
  }, [records, focusWorkerId]);

  function onSaved(record: ComplianceRecord) {
    setRecords((prev) => {
      const idx = prev.findIndex((x) => x.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [record, ...prev];
    });
  }

  async function confirmDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/compliance-records/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setRecords((prev) => prev.filter((x) => x.id !== id));
      setDeleteId(null);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(path: string) {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 60 * 10);
      if (signErr || !data?.signedUrl) {
        setError(signErr?.message ?? c.documentOpenFailed);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(c.documentOpenFailed);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-ink">{c.title}</h2>
        <p className="mt-1 text-sm text-ink/70">
          {c.intro.replace("{client}", clientName)}
        </p>
        {focusWorkerId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <span className="text-ink">
              {c.filterWorkerBanner.replace(
                "{name}",
                focusWorkerName ?? focusWorkerId.slice(0, 8),
              )}
            </span>
            {onClearWorkerFocus ? (
              <button
                type="button"
                onClick={onClearWorkerFocus}
                className="bzr-btn-ghost bzr-btn-sm"
              >
                {c.clearWorkerFilter}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink/70">{m.common.loading}</p>
      ) : (
        SECTION_TYPES.map((type) => {
          const list = grouped[type];
          return (
            <section key={type} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-2">
                <h3 className="text-sm font-semibold text-ink">
                  {c.typeLabels[type]}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setFormType(type);
                  }}
                  className="bzr-btn-primary !px-3 !py-1 text-xs"
                >
                  {c.add}
                </button>
              </div>

              {list.length === 0 ? (
                <p className="text-sm text-ink/60">{c.emptySection}</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((row) => {
                    const status = getComplianceStatus(row.expiry_date);
                    return (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-3 border border-ink/15 bg-ink/[0.02] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">
                              {row.subject_name}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ${STATUS_CLASS[status.kind]}`}
                            >
                              {c.status[status.kind]}
                              {status.kind === "expiring" &&
                              status.daysRemaining != null
                                ? ` (${status.daysRemaining}d)`
                                : null}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-ink/75">
                            {row.category}
                          </p>
                          <p className="mt-0.5 text-xs text-ink/55">
                            {c.expiryDate}:{" "}
                            {formatDate(row.expiry_date, locale)}
                            {row.issued_date
                              ? ` · ${c.issuedDate}: ${formatDate(row.issued_date, locale)}`
                              : null}
                          </p>
                          {row.notes ? (
                            <p className="mt-1 text-xs text-ink/65">
                              {row.notes}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {row.document_url ? (
                            <button
                              type="button"
                              onClick={() => void openDocument(row.document_url!)}
                              className="rounded-lg border border-border/40 px-2 py-0.5 text-xs"
                            >
                              {c.viewDocument}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setFormType(row.record_type);
                              setEditing(row);
                            }}
                            className="rounded-lg border border-border/40 px-2 py-0.5 text-xs"
                          >
                            {m.common.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(row.id)}
                            className="rounded-lg border border-red-800/40 px-2 py-0.5 text-xs text-red-800"
                          >
                            {m.common.delete}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}

      {formType ? (
        <ComplianceRecordForm
          clientCompanyId={clientCompanyId}
          recordType={formType}
          initial={editing}
          defaultSubjectId={
            !editing && focusWorkerId ? focusWorkerId : undefined
          }
          defaultSubjectName={
            !editing && focusWorkerId
              ? (focusWorkerName ?? undefined)
              : undefined
          }
          onClose={() => {
            setFormType(null);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {deleteId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border/40 bg-surface p-6 shadow-lg">
            <h3 className="font-semibold text-ink">{c.deleteTitle}</h3>
            <p className="mt-2 text-sm text-ink/80">{c.deleteConfirm}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete(deleteId)}
                className="border border-red-800 bg-red-50 px-4 py-1.5 text-sm font-semibold text-red-900"
              >
                {busy ? m.common.loading : m.common.delete}
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-border/40 px-4 py-1.5 text-sm"
              >
                {m.common.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
