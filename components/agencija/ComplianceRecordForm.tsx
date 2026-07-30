"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  COMPLIANCE_CATEGORIES,
  RECORD_TYPE_SUBJECT,
  type ComplianceRecord,
  type ComplianceRecordType,
} from "@/lib/compliance/types";
import {
  displayDateToIso,
  isoToDisplayDate,
} from "@/lib/shared/date-format";

type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
};

type Props = {
  clientCompanyId: string;
  recordType: ComplianceRecordType;
  initial?: ComplianceRecord | null;
  /** Predizbor radnika pri novom zapisu (npr. ?worker_id=). */
  defaultSubjectId?: string;
  defaultSubjectName?: string;
  onClose: () => void;
  onSaved: (record: ComplianceRecord) => void;
};

function employeeLabel(e: EmployeeOption): string {
  return `${e.last_name} ${e.first_name}`.trim();
}

export function ComplianceRecordForm({
  clientCompanyId,
  recordType,
  initial,
  defaultSubjectId,
  defaultSubjectName,
  onClose,
  onSaved,
}: Props) {
  const { m } = useTranslations();
  const c = m.agencija.compliance;
  const subjectType = RECORD_TYPE_SUBJECT[recordType];
  const categories = COMPLIANCE_CATEGORIES[recordType];
  const isEdit = Boolean(initial);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [subjectId, setSubjectId] = useState(
    initial?.subject_id ?? defaultSubjectId ?? "",
  );
  const [subjectName, setSubjectName] = useState(
    initial?.subject_name ?? defaultSubjectName ?? "",
  );
  const [category, setCategory] = useState(
    initial?.category ?? categories[0] ?? "",
  );
  const [issuedDate, setIssuedDate] = useState(
    isoToDisplayDate(initial?.issued_date),
  );
  const [expiryDate, setExpiryDate] = useState(
    isoToDisplayDate(initial?.expiry_date),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subjectType !== "worker") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/clients/${clientCompanyId}/employees`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          employees?: EmployeeOption[];
          error?: string;
        };
        if (!res.ok || cancelled) return;
        const list = json.employees ?? [];
        setEmployees(list);
        if (!initial && defaultSubjectId && !defaultSubjectName) {
          const hit = list.find((w) => w.id === defaultSubjectId);
          if (hit) setSubjectName(employeeLabel(hit));
        }
      } catch {
        /* ignore — form still usable with empty list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientCompanyId, subjectType]);

  async function uploadDocument(recordId: string, selected: File) {
    const urlRes = await fetch(
      `/api/compliance-records/${recordId}/document/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selected.name }),
      },
    );
    const urlJson = (await urlRes.json().catch(() => ({}))) as {
      storage_path?: string;
      token?: string;
      bucket?: string;
      error?: string;
    };
    if (!urlRes.ok || !urlJson.storage_path || !urlJson.token) {
      throw new Error(urlJson.error ?? c.uploadFailed);
    }

    const supabase = createBrowserSupabaseClient();
    const { error: upErr } = await supabase.storage
      .from(urlJson.bucket ?? "documents")
      .uploadToSignedUrl(urlJson.storage_path, urlJson.token, selected);
    if (upErr) {
      throw new Error(upErr.message);
    }

    const patchRes = await fetch(`/api/compliance-records/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_url: urlJson.storage_path }),
    });
    const patchJson = (await patchRes.json().catch(() => ({}))) as {
      record?: ComplianceRecord;
      error?: string;
    };
    if (!patchRes.ok || !patchJson.record) {
      throw new Error(patchJson.error ?? c.uploadFailed);
    }
    return patchJson.record;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const issuedIso = displayDateToIso(issuedDate);
    const expiryIso = displayDateToIso(expiryDate);
    if (issuedIso === "invalid" || expiryIso === "invalid") {
      setError(c.dateInvalid);
      return;
    }

    setLoading(true);
    try {
      let record: ComplianceRecord;

      if (isEdit && initial) {
        /* Izmena: radnik i kategorija ostaju nepromenjeni. */
        const res = await fetch(`/api/compliance-records/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issued_date: issuedIso,
            expiry_date: expiryIso,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          record?: ComplianceRecord;
          error?: string;
        };
        if (!res.ok || !json.record) {
          setError(json.error ?? m.common.error);
          return;
        }
        record = json.record;
      } else {
        let name = subjectName.trim();
        let sid: string | null = subjectId || null;

        if (subjectType === "worker") {
          const emp = employees.find((x) => x.id === subjectId);
          if (!emp) {
            setError(c.workerRequired);
            return;
          }
          name = employeeLabel(emp);
          sid = emp.id;
        } else if (!name) {
          setError(c.equipmentNameRequired);
          return;
        }

        if (!category.trim()) {
          setError(c.categoryRequired);
          return;
        }

        const res = await fetch("/api/compliance-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_company_id: clientCompanyId,
            record_type: recordType,
            subject_id: subjectType === "worker" ? sid : null,
            subject_name: name,
            category: category.trim(),
            issued_date: issuedIso,
            expiry_date: expiryIso,
            notes: notes.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          record?: ComplianceRecord;
          error?: string;
        };
        if (!res.ok || !json.record) {
          setError(json.error ?? m.common.error);
          return;
        }
        record = json.record;
      }

      if (file) {
        record = await uploadDocument(record.id, file);
      }

      onSaved(record);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-form-title"
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border/40 bg-surface p-6 shadow-lg"
      >
        <h3 id="compliance-form-title" className="font-semibold text-ink">
          {isEdit ? c.editRecord : c.addRecord}
        </h3>
        <p className="mt-1 text-xs text-ink/60">{c.typeLabels[recordType]}</p>
        {isEdit ? (
          <p className="mt-2 text-xs text-ink/70">{c.editLockedHint}</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {isEdit ? (
            <>
              <div>
                <p className="text-xs font-medium text-ink/55">
                  {subjectType === "worker" ? c.worker : c.equipmentName}
                </p>
                <p className="mt-1 text-sm font-medium text-ink">
                  {subjectName || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink/55">{c.category}</p>
                <p className="mt-1 text-sm font-medium text-ink">
                  {category || "—"}
                </p>
              </div>
            </>
          ) : subjectType === "worker" ? (
            <div>
              <label className="block text-xs font-medium" htmlFor="cr-worker">
                {c.worker}
              </label>
              <select
                id="cr-worker"
                value={subjectId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSubjectId(id);
                  const emp = employees.find((x) => x.id === id);
                  if (emp) setSubjectName(employeeLabel(emp));
                }}
                required
                className="mt-1 w-full rounded-lg border border-border/40 px-2 py-1.5 text-sm"
              >
                <option value="">{c.selectWorker}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {employeeLabel(emp)}
                  </option>
                ))}
              </select>
              {employees.length === 0 ? (
                <p className="mt-1 text-xs text-ink/60">{c.noEmployees}</p>
              ) : null}
            </div>
          ) : (
            <div>
              <label
                className="block text-xs font-medium"
                htmlFor="cr-equipment"
              >
                {c.equipmentName}
              </label>
              <input
                id="cr-equipment"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border/40 px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {!isEdit ? (
            <div>
              <label className="block text-xs font-medium" htmlFor="cr-category">
                {c.category}
              </label>
              <select
                id="cr-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border/40 px-2 py-1.5 text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium" htmlFor="cr-issued">
                {c.issuedDate}
              </label>
              <input
                id="cr-issued"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={c.datePlaceholder}
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                onBlur={() => {
                  const iso = displayDateToIso(issuedDate);
                  if (iso && iso !== "invalid") {
                    setIssuedDate(isoToDisplayDate(iso));
                  }
                }}
                className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium" htmlFor="cr-expiry">
                {c.expiryDate}
              </label>
              <input
                id="cr-expiry"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={c.datePlaceholder}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                onBlur={() => {
                  const iso = displayDateToIso(expiryDate);
                  if (iso && iso !== "invalid") {
                    setExpiryDate(isoToDisplayDate(iso));
                  }
                }}
                className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
              />
              <p className="mt-1 text-xs text-ink/55">{c.expiryOptional}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium" htmlFor="cr-doc">
              {c.document}
            </label>
            <input
              id="cr-doc"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
            {initial?.document_url && !file ? (
              <p className="mt-1 text-xs text-ink/60">{c.documentAttached}</p>
            ) : null}
          </div>

          {!isEdit ? (
            <div>
              <label className="block text-xs font-medium" htmlFor="cr-notes">
                {c.notes}
              </label>
              <textarea
                id="cr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border/40 px-2 py-1.5 text-sm"
              />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="bzr-btn-primary !px-4 !py-1.5"
          >
            {loading ? m.common.loading : m.common.save}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-border/40 px-4 py-1.5 text-sm"
          >
            {m.common.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}
