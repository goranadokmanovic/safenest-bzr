"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  OperationAddressesField,
  parseOperationAddresses,
} from "@/components/admin/operation-addresses-field";
import { ClientEmployeesEditor } from "@/components/admin/ClientEmployeesEditor";
import { ComplianceRecordsPanel } from "@/components/agencija/ComplianceRecordsPanel";
import type {
  ClientRow,
  CollaboratorOption,
} from "@/components/admin/ClientsList";
import { normalizeOperationAddresses } from "@/lib/api/schemas";
import type { EmployeeDraft } from "@/lib/employees/drafts";

export type ClientDetailTab = "osnovni" | "radnici" | "rokovi";

const TABS: ClientDetailTab[] = ["osnovni", "radnici", "rokovi"];

function parseTab(raw: string | null): ClientDetailTab {
  if (raw === "radnici" || raw === "rokovi" || raw === "osnovni") return raw;
  return "osnovni";
}

type EditDraft = {
  name: string;
  tax_id: string;
  activity_sector: string;
  address: string;
  operation_addresses: string[];
  contact_email: string;
  assigned_collaborator_id: string;
};

function draftFromRow(row: ClientRow): EditDraft {
  const op = parseOperationAddresses(row.operation_addresses);
  return {
    name: row.name,
    tax_id: row.tax_id ?? "",
    activity_sector: row.activity_sector ?? "",
    address: row.address ?? "",
    operation_addresses: op.length > 0 ? op : [""],
    contact_email: row.contact_email ?? "",
    assigned_collaborator_id: row.assigned_collaborator_id ?? "",
  };
}

type Props = {
  client: ClientRow;
  collaborators: CollaboratorOption[];
  initialTab?: ClientDetailTab;
};

export function ClientDetailView({
  client,
  collaborators,
  initialTab = "osnovni",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { m, locale } = useTranslations();
  const c = m.admin.clients;

  const tab = parseTab(searchParams.get("tab") ?? initialTab);
  const focusWorkerId = searchParams.get("worker_id");

  const [draft, setDraft] = useState<EditDraft>(() => draftFromRow(client));
  const [employeeDrafts, setEmployeeDrafts] = useState<EmployeeDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function replaceQuery(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.replace(
      qs
        ? `/agencija/klijenti/${client.id}?${qs}`
        : `/agencija/klijenti/${client.id}`,
      { scroll: false },
    );
  }

  function setTab(next: ClientDetailTab) {
    replaceQuery((params) => {
      if (next === "osnovni") params.delete("tab");
      else params.set("tab", next);
      if (next !== "rokovi") params.delete("worker_id");
    });
  }

  function clearWorkerFocus() {
    replaceQuery((params) => {
      params.delete("worker_id");
    });
  }

  async function saveBasics() {
    if (!draft.name.trim()) {
      setError(c.nameRequired);
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          tax_id: draft.tax_id.trim() || null,
          activity_sector: draft.activity_sector.trim() || null,
          address: draft.address.trim() || null,
          operation_addresses: normalizeOperationAddresses(
            draft.operation_addresses,
          ),
          contact_email: draft.contact_email.trim() || null,
          assigned_collaborator_id: draft.assigned_collaborator_id || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setNotice(c.saved);
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      router.push("/agencija/klijenti");
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  const tabLabels: Record<ClientDetailTab, string> = {
    osnovni: c.tabBasics,
    radnici: c.tabEmployees,
    rokovi: c.tabDeadlines,
  };

  let createdLabel = client.created_at;
  try {
    createdLabel = new Date(client.created_at).toLocaleString(
      locale === "en" ? "en-US" : "sr-RS",
    );
  } catch {
    /* keep iso */
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink">
          {draft.name.trim() || client.name}
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {client.agency_name ?? client.agency_id.slice(0, 8)} · {createdLabel}
        </p>
      </div>

      <div className="bzr-tabs" role="tablist" aria-label={c.title}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={["bzr-tab", tab === id ? "is-active" : ""].join(" ")}
            onClick={() => setTab(id)}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel">
        {tab === "osnovni" ? (
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void saveBasics()}
                className="bzr-btn-primary"
              >
                {loading ? m.common.loading : m.common.save}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-medium">
                  {c.companyName} *
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">{c.pib}</label>
                <input
                  value={draft.tax_id}
                  onChange={(e) =>
                    setDraft({ ...draft, tax_id: e.target.value })
                  }
                  inputMode="numeric"
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">{c.industry}</label>
                <input
                  value={draft.activity_sector}
                  onChange={(e) =>
                    setDraft({ ...draft, activity_sector: e.target.value })
                  }
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">{c.email}</label>
                <input
                  type="email"
                  value={draft.contact_email}
                  onChange={(e) =>
                    setDraft({ ...draft, contact_email: e.target.value })
                  }
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium"
                  htmlFor={`assigned-${client.id}`}
                >
                  {c.assignedCollaborator}
                </label>
                <select
                  id={`assigned-${client.id}`}
                  value={draft.assigned_collaborator_id}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      assigned_collaborator_id: e.target.value,
                    })
                  }
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                >
                  <option value="">{c.unassigned}</option>
                  {collaborators.map((w) => (
                    <option key={w.user_id} value={w.user_id}>
                      {w.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">
                  {c.registrationAddress}
                </label>
                <textarea
                  value={draft.address}
                  onChange={(e) =>
                    setDraft({ ...draft, address: e.target.value })
                  }
                  rows={2}
                  className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <OperationAddressesField
                  idPrefix={`detail-${client.id}`}
                  values={draft.operation_addresses}
                  onChange={(operation_addresses) =>
                    setDraft({ ...draft, operation_addresses })
                  }
                />
              </div>
            </div>

            {error ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="mt-3 text-sm text-success" role="status">
                {notice}
              </p>
            ) : null}

            <div className="mt-8 flex justify-end border-t border-ink/15 pt-5">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setDeleteOpen(true);
                  setError(null);
                }}
                className="rounded-lg border border-red-800 px-4 py-1.5 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50"
              >
                {c.deleteClient}
              </button>
            </div>
          </div>
        ) : null}

        {tab === "radnici" ? (
          <ClientEmployeesEditor
            clientId={client.id}
            rows={employeeDrafts}
            onRowsChange={setEmployeeDrafts}
          />
        ) : null}

        {tab === "rokovi" ? (
          <ComplianceRecordsPanel
            clientCompanyId={client.id}
            clientName={draft.name.trim() || client.name}
            focusWorkerId={focusWorkerId}
            onClearWorkerFocus={clearWorkerFocus}
          />
        ) : null}
      </div>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border/40 bg-surface p-6 shadow-lg">
            <h3 className="font-semibold text-ink">{c.deleteTitle}</h3>
            <p className="mt-2 text-sm text-ink/80">{c.deleteConfirm}</p>
            {error ? (
              <p className="mt-2 text-sm text-red-700">{error}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmDelete()}
                className="border border-red-800 bg-red-50 px-4 py-1.5 text-sm font-semibold text-red-900"
              >
                {loading ? m.common.loading : m.common.delete}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
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
    </div>
  );
}
