"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/locale-provider";
import { SpreadsheetImportDialog } from "@/components/import/SpreadsheetImportDialog";
import { warmSpreadsheetParser } from "@/lib/import/parse-sheet";
import type { ImportField } from "@/lib/import/types";
import { displayDateToIso, isoToDisplayDate } from "@/lib/shared/date-format";
import { looksLikeJmbgAttempt, validateJmbg } from "@/lib/shared/jmbg-validate";
import {
  aggregateWorkerDeadlines,
  formatDeadlineSummary,
  WORKER_DEADLINE_BADGE_CLASS,
} from "@/lib/compliance/worker-status";
import type { ComplianceRecord } from "@/lib/compliance/types";
import {
  createEmployeeDraft,
  draftsToPayloads,
  isDraftEmpty,
  postEmployees,
  type EmployeeDraft,
  type ExistingEmployee,
} from "@/lib/employees/drafts";

type EmployeeFieldKey =
  | "first_name"
  | "last_name"
  | "position"
  | "personal_id_masked"
  | "employment_start"
  | "active";

type EditExistingDraft = {
  first_name: string;
  last_name: string;
  position: string;
  personal_id_masked: string;
  employment_start: string;
};

type Props = {
  /** null/undefined = klijent još ne postoji, radnici se čuvaju uz njega. */
  clientId?: string | null;
  rows: EmployeeDraft[];
  onRowsChange: (rows: EmployeeDraft[]) => void;
};

function draftFromExisting(row: ExistingEmployee): EditExistingDraft {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    position: row.position ?? "",
    personal_id_masked: row.personal_id_masked ?? "",
    employment_start: isoToDisplayDate(row.employment_start),
  };
}

export function ClientEmployeesEditor({
  clientId,
  rows,
  onRowsChange,
}: Props) {
  const router = useRouter();
  const { m } = useTranslations();
  const e = m.admin.clients.employees;
  const persisted = !!clientId;

  const [existing, setExisting] = useState<ExistingEmployee[]>([]);
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditExistingDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/employees`);
      const json = (await res.json().catch(() => ({}))) as {
        employees?: ExistingEmployee[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? e.loadFailed);
        return;
      }
      setExisting(json.employees ?? []);
    } catch {
      setError(e.loadFailed);
    }
  }, [clientId, e.loadFailed]);

  const loadCompliance = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(
        `/api/compliance-records?client_company_id=${encodeURIComponent(clientId)}`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        records?: ComplianceRecord[];
      };
      if (res.ok) setRecords(json.records ?? []);
    } catch {
      /* status kolona ostaje „nema rokova” ako fetch padne */
    }
  }, [clientId]);

  useEffect(() => {
    void loadExisting();
    void loadCompliance();
  }, [loadExisting, loadCompliance]);

  const summaryTemplates = useMemo(
    () => ({
      expired: e.statusExpired,
      missing: e.statusMissing,
      expiring: e.statusExpiring,
      valid: e.statusValid,
    }),
    [e],
  );

  const importFields = useMemo<ImportField<EmployeeFieldKey>[]>(
    () => [
      {
        key: "first_name",
        label: e.firstName,
        required: true,
        maxLength: 200,
        aliases: ["ime", "first name", "firstname", "given name", "name"],
      },
      {
        key: "last_name",
        label: e.lastName,
        required: true,
        maxLength: 200,
        aliases: ["prezime", "last name", "lastname", "surname", "family name"],
      },
      {
        key: "position",
        label: e.position,
        maxLength: 200,
        aliases: [
          "radno mesto",
          "pozicija",
          "funkcija",
          "zvanje",
          "job title",
          "role",
        ],
      },
      {
        key: "personal_id_masked",
        label: e.personalId,
        maxLength: 50,
        warn: (value) =>
          looksLikeJmbgAttempt(value) && !validateJmbg(value)
            ? e.jmbgImportWarning
            : null,
        aliases: [
          "jmbg",
          "maticni broj",
          "licna karta",
          "broj licne",
          "national id",
          "personal id",
          "id number",
        ],
      },
      {
        key: "employment_start",
        label: e.employmentStart,
        type: "date",
        aliases: [
          "datum zaposlenja",
          "datum prijema",
          "pocetak rada",
          "employment start",
          "start date",
          "hire date",
        ],
      },
      {
        key: "active",
        label: e.active,
        type: "boolean",
        aliases: ["aktivan", "active", "status"],
      },
    ],
    [e],
  );

  function updateRow(key: string, patch: Partial<EmployeeDraft>) {
    onRowsChange(
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setInvalidKeys((keys) => keys.filter((k) => k !== key));
  }

  function addRow() {
    onRowsChange([...rows, createEmployeeDraft()]);
  }

  function removeRow(key: string) {
    onRowsChange(rows.filter((row) => row.key !== key));
    setInvalidKeys((keys) => keys.filter((k) => k !== key));
  }

  function startEdit(row: ExistingEmployee) {
    setEditingId(row.id);
    setEditDraft(draftFromExisting(row));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    if (!editDraft.first_name.trim() || !editDraft.last_name.trim()) {
      setError(e.nameRequired);
      return;
    }
    const iso = displayDateToIso(editDraft.employment_start);
    if (iso === "invalid") {
      setError(e.dateInvalid);
      return;
    }

    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editDraft.first_name.trim(),
          last_name: editDraft.last_name.trim(),
          position: editDraft.position.trim() || null,
          personal_id_masked: editDraft.personal_id_masked.trim() || null,
          employment_start: iso,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        employee?: ExistingEmployee;
        error?: string;
      };
      if (!res.ok || !json.employee) {
        setError(json.error ?? m.common.error);
        return;
      }
      setExisting((list) =>
        list.map((row) => (row.id === editingId ? json.employee! : row)),
      );
      cancelEdit();
    } catch {
      setError(m.common.networkError);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteExisting(id: string) {
    if (!window.confirm(e.deleteConfirm)) return;
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? m.common.error);
        return;
      }
      setExisting((list) => list.filter((row) => row.id !== id));
      if (editingId === id) cancelEdit();
    } catch {
      setError(m.common.networkError);
    }
  }

  function openDeadlines(workerId: string) {
    if (!clientId) return;
    router.push(
      `/agencija/klijenti/${clientId}?tab=rokovi&worker_id=${encodeURIComponent(workerId)}`,
    );
  }

  async function saveDrafts() {
    if (!clientId) return;
    setError(null);
    setNotice(null);

    const conversion = draftsToPayloads(rows);
    setInvalidKeys(conversion.invalidKeys);
    if (conversion.invalidKeys.length > 0) {
      setError(
        conversion.missingNameKeys.length > 0 ? e.nameRequired : e.dateInvalid,
      );
      return;
    }
    const { payloads } = conversion;
    if (payloads.length === 0) return;

    setSaving(true);
    try {
      const outcome = await postEmployees(clientId, payloads);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      onRowsChange([]);
      setNotice(e.saved);
      await loadExisting();
    } catch {
      setError(m.common.networkError);
    } finally {
      setSaving(false);
    }
  }

  const importedToDrafts = useCallback(
    (imported: Record<EmployeeFieldKey, string | null>[]): EmployeeDraft[] =>
      imported.map((row) =>
        createEmployeeDraft({
          first_name: row.first_name ?? "",
          last_name: row.last_name ?? "",
          position: row.position ?? "",
          personal_id_masked: row.personal_id_masked ?? "",
          employment_start: isoToDisplayDate(row.employment_start),
          active: row.active !== "false",
        }),
      ),
    [],
  );

  async function onImport(
    imported: Record<EmployeeFieldKey, string | null>[],
  ): Promise<{ imported: number; error?: string }> {
    const drafts = importedToDrafts(imported);

    if (!clientId) {
      onRowsChange([...rows.filter((row) => !isDraftEmpty(row)), ...drafts]);
      return { imported: drafts.length };
    }

    const { payloads } = draftsToPayloads(drafts);
    const outcome = await postEmployees(clientId, payloads);
    if (outcome.error) return { imported: outcome.created, error: outcome.error };
    await loadExisting();
    return { imported: outcome.created };
  }

  const pendingCount = rows.filter((row) => !isDraftEmpty(row)).length;

  return (
    <section className="rounded-lg border border-ink/25 bg-ink/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{e.title}</h3>
          <p className="mt-1 max-w-prose text-xs text-ink/65">
            {persisted ? e.hint : e.draftHint}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
          >
            {e.add}
          </button>
          <button
            type="button"
            onMouseEnter={warmSpreadsheetParser}
            onFocus={warmSpreadsheetParser}
            onClick={() => setImportOpen(true)}
            className="bzr-btn-secondary bzr-btn-sm"
          >
            {e.importFromFile}
          </button>
        </div>
      </div>

      {persisted && editingId && editDraft ? (
        <div className="mt-4 rounded-xl border border-ink/20 bg-surface/50 p-4">
          <button
            type="button"
            onClick={cancelEdit}
            className="bzr-back mb-3"
          >
            {e.backToList}
          </button>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-ink">
                {editDraft.last_name} {editDraft.first_name}
              </h4>
              <p className="mt-0.5 text-xs text-ink/60">{e.detailHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void saveEdit()}
                className="bzr-btn-primary"
              >
                {editSaving ? m.common.loading : m.common.save}
              </button>
              <button
                type="button"
                onClick={() => openDeadlines(editingId)}
                className="bzr-btn-secondary"
              >
                {e.openDeadlines}
              </button>
            </div>
          </div>

          {(() => {
            const jmbgWarn =
              looksLikeJmbgAttempt(editDraft.personal_id_masked) &&
              !validateJmbg(editDraft.personal_id_masked);
            const agg = aggregateWorkerDeadlines(records, editingId);
            const statusLabel =
              agg.kind === "none"
                ? e.noDeadlines
                : formatDeadlineSummary(agg.counts, summaryTemplates);
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium">
                      {e.firstName} *
                    </label>
                    <input
                      value={editDraft.first_name}
                      onChange={(ev) =>
                        setEditDraft({
                          ...editDraft,
                          first_name: ev.target.value,
                        })
                      }
                      className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">
                      {e.lastName} *
                    </label>
                    <input
                      value={editDraft.last_name}
                      onChange={(ev) =>
                        setEditDraft({
                          ...editDraft,
                          last_name: ev.target.value,
                        })
                      }
                      className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">
                      {e.position}
                    </label>
                    <input
                      value={editDraft.position}
                      onChange={(ev) =>
                        setEditDraft({
                          ...editDraft,
                          position: ev.target.value,
                        })
                      }
                      className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">
                      {e.personalId}
                    </label>
                    <input
                      value={editDraft.personal_id_masked}
                      onChange={(ev) =>
                        setEditDraft({
                          ...editDraft,
                          personal_id_masked: ev.target.value,
                        })
                      }
                      title={jmbgWarn ? e.jmbgSuspicious : undefined}
                      className={[
                        "bzr-input mt-1 !rounded-lg !px-2 !py-1.5 !font-mono",
                        jmbgWarn ? "bzr-input-warn" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                    {jmbgWarn ? (
                      <p
                        role="status"
                        className="mt-1 flex items-start gap-1 text-[11px] leading-tight text-warning"
                      >
                        <span aria-hidden="true">⚠</span>
                        <span>{e.jmbgSuspicious}</span>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-medium">
                      {e.employmentStart}
                    </label>
                    <input
                      value={editDraft.employment_start}
                      onChange={(ev) =>
                        setEditDraft({
                          ...editDraft,
                          employment_start: ev.target.value,
                        })
                      }
                      onBlur={(ev) => {
                        const iso = displayDateToIso(ev.target.value);
                        if (iso && iso !== "invalid") {
                          setEditDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  employment_start: isoToDisplayDate(iso),
                                }
                              : d,
                          );
                        }
                      }}
                      inputMode="numeric"
                      placeholder={e.datePlaceholder}
                      className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">
                      {e.colDeadlineStatus}
                    </label>
                    <div className="mt-2">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${WORKER_DEADLINE_BADGE_CLASS[agg.kind]}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end border-t border-ink/15 pt-5">
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => void deleteExisting(editingId)}
                    className="rounded-lg border border-red-800 px-4 py-1.5 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {m.common.delete}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {persisted && existing.length > 0 && !(editingId && editDraft) ? (
        <div className="bzr-table-wrap bzr-employees-table mt-4">
          <p className="mb-2 text-xs text-ink/60">
            {e.count.replace("{count}", String(existing.length))}
          </p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="w-[18%]">{e.colName}</th>
                <th className="w-[16%]">{e.colPosition}</th>
                <th className="w-[16%]">{e.colPersonalId}</th>
                <th className="w-[12%]">{e.colEmploymentStart}</th>
                <th className="w-[26%]">{e.colDeadlineStatus}</th>
                <th className="w-[12%]">{e.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {existing.map((row) => {
                const agg = aggregateWorkerDeadlines(records, row.id);
                const statusLabel =
                  agg.kind === "none"
                    ? e.noDeadlines
                    : formatDeadlineSummary(agg.counts, summaryTemplates);

                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => startEdit(row)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        startEdit(row);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${row.last_name} ${row.first_name}`}
                  >
                    <td>
                      <span className="block text-[0.8125rem] font-medium leading-snug text-ink underline-offset-2 hover:underline">
                        {row.last_name} {row.first_name}
                      </span>
                    </td>
                    <td>
                      <span className="block text-[0.8125rem] leading-snug">
                        {row.position ?? m.common.noData}
                      </span>
                    </td>
                    <td>
                      <span className="block break-all font-mono text-[0.7rem] leading-snug">
                        {row.personal_id_masked ?? m.common.noData}
                      </span>
                    </td>
                    <td>
                      <span className="block text-[0.8125rem] leading-snug">
                        {row.employment_start
                          ? isoToDisplayDate(row.employment_start)
                          : m.common.noData}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block max-w-full rounded px-1.5 py-0.5 text-[11px] font-medium leading-snug ${WORKER_DEADLINE_BADGE_CLASS[agg.kind]}`}
                        title={statusLabel}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <div className="bzr-emp-actions">
                        <button
                          type="button"
                          onClick={() => openDeadlines(row.id)}
                          className="bzr-btn-secondary bzr-btn-sm"
                        >
                          {e.openDeadlines}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : persisted && !(editingId && editDraft) ? (
        <p className="mt-4 text-xs text-ink/55">{e.none}</p>
      ) : null}

      {rows.length === 0 && !persisted ? (
        <p className="mt-4 text-xs text-ink/55">{e.none}</p>
      ) : rows.length > 0 ? (
        <div className="mt-4 space-y-2">
          {persisted ? (
            <p className="text-xs font-medium text-ink/70">
              {e.pendingCount.replace("{count}", String(pendingCount || rows.length))}
            </p>
          ) : null}
          {rows.map((row) => {
            const bad = invalidKeys.includes(row.key);
            const personalId = row.personal_id_masked.replace(/\s+/g, "");
            const jmbgWarn =
              looksLikeJmbgAttempt(personalId) && !validateJmbg(personalId);
            return (
              <div
                key={row.key}
                className={[
                  "grid gap-2 rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_9rem_auto]",
                  bad ? "border-red-700/60" : "border-ink/15",
                ].join(" ")}
              >
                <input
                  value={row.first_name}
                  onChange={(ev) =>
                    updateRow(row.key, { first_name: ev.target.value })
                  }
                  placeholder={e.firstName}
                  aria-label={e.firstName}
                  className="bzr-input !rounded-lg !px-2 !py-1.5 !text-sm"
                />
                <input
                  value={row.last_name}
                  onChange={(ev) =>
                    updateRow(row.key, { last_name: ev.target.value })
                  }
                  placeholder={e.lastName}
                  aria-label={e.lastName}
                  className="bzr-input !rounded-lg !px-2 !py-1.5 !text-sm"
                />
                <input
                  value={row.position}
                  onChange={(ev) =>
                    updateRow(row.key, { position: ev.target.value })
                  }
                  placeholder={e.position}
                  aria-label={e.position}
                  className="bzr-input !rounded-lg !px-2 !py-1.5 !text-sm"
                />
                <div className="min-w-0">
                  <input
                    value={row.personal_id_masked}
                    onChange={(ev) =>
                      updateRow(row.key, {
                        personal_id_masked: ev.target.value,
                      })
                    }
                    placeholder={e.personalId}
                    aria-label={e.personalId}
                    title={jmbgWarn ? e.jmbgSuspicious : undefined}
                    aria-describedby={
                      jmbgWarn ? `jmbg-hint-${row.key}` : undefined
                    }
                    className={[
                      "bzr-input !rounded-lg !px-2 !py-1.5 !text-sm",
                      jmbgWarn ? "bzr-input-warn" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  {jmbgWarn ? (
                    <p
                      id={`jmbg-hint-${row.key}`}
                      role="status"
                      className="mt-1 flex items-start gap-1 text-[11px] leading-tight text-warning"
                    >
                      <span aria-hidden="true">⚠</span>
                      <span>{e.jmbgSuspicious}</span>
                    </p>
                  ) : null}
                </div>
                <input
                  value={row.employment_start}
                  onChange={(ev) =>
                    updateRow(row.key, { employment_start: ev.target.value })
                  }
                  onBlur={(ev) => {
                    const iso = displayDateToIso(ev.target.value);
                    if (iso && iso !== "invalid") {
                      updateRow(row.key, {
                        employment_start: isoToDisplayDate(iso),
                      });
                    }
                  }}
                  inputMode="numeric"
                  placeholder={e.datePlaceholder}
                  aria-label={e.employmentStart}
                  className="bzr-input !rounded-lg !px-2 !py-1.5 !text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={e.remove}
                  className="justify-self-start rounded-lg border border-border/40 px-2 py-1 text-xs text-ink/70 sm:justify-self-center"
                >
                  {e.remove}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-sm text-ink/75">{notice}</p> : null}

      {persisted && pendingCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDrafts()}
            className="bzr-btn-primary !px-4 !py-1.5"
          >
            {saving ? m.common.loading : e.save}
          </button>
          <span className="text-xs text-ink/60">
            {e.pendingCount.replace("{count}", String(pendingCount))}
          </span>
        </div>
      ) : null}

      <SpreadsheetImportDialog
        open={importOpen}
        title={e.importTitle}
        fields={importFields}
        dedupeKeys={["first_name", "last_name", "personal_id_masked"]}
        onClose={() => setImportOpen(false)}
        onImport={onImport}
      />
    </section>
  );
}
