"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { OperationAddressesField } from "@/components/admin/operation-addresses-field";
import { ClientEmployeesEditor } from "@/components/admin/ClientEmployeesEditor";
import { normalizeOperationAddresses } from "@/lib/api/schemas";
import {
  draftsToPayloads,
  postEmployees,
  type EmployeeDraft,
} from "@/lib/employees/drafts";
import type { CollaboratorOption } from "@/components/admin/ClientsList";

export type AgencyOption = { id: string; name: string };

type Props = {
  agencies: AgencyOption[];
  defaultAgencyId?: string | null;
  collaborators?: CollaboratorOption[];
};

export function ClientForm({
  agencies,
  defaultAgencyId,
  collaborators = [],
}: Props) {
  const router = useRouter();
  const { m } = useTranslations();
  const c = m.admin.clients;
  const [open, setOpen] = useState(false);
  const [agencyId, setAgencyId] = useState(
    defaultAgencyId ?? agencies[0]?.id ?? "",
  );
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [activitySector, setActivitySector] = useState("");
  const [registrationAddress, setRegistrationAddress] = useState("");
  const [operationAddresses, setOperationAddresses] = useState<string[]>([""]);
  const [contactEmail, setContactEmail] = useState("");
  const [assignedCollaboratorId, setAssignedCollaboratorId] = useState("");
  const [employees, setEmployees] = useState<EmployeeDraft[]>([]);
  /** Popunjeno ako je klijent kreiran, a čuvanje radnika palo — sprečava duplikat. */
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAgencyPick = agencies.length > 1;

  function resetForm() {
    setName("");
    setTaxId("");
    setActivitySector("");
    setRegistrationAddress("");
    setOperationAddresses([""]);
    setContactEmail("");
    setAssignedCollaboratorId("");
    setEmployees([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(c.nameRequired);
      return;
    }
    if (needsAgencyPick && !agencyId) {
      setError(c.selectClient);
      return;
    }

    const employeeConversion = draftsToPayloads(employees);
    if (employeeConversion.invalidKeys.length > 0) {
      setError(
        employeeConversion.missingNameKeys.length > 0
          ? c.employees.nameRequired
          : c.employees.dateInvalid,
      );
      return;
    }
    const employeePayloads = employeeConversion.payloads;

    setLoading(true);
    try {
      let clientId = createdClientId;

      if (!clientId) {
        const body: Record<string, unknown> = {
          name: name.trim(),
          tax_id: taxId.trim() || null,
          activity_sector: activitySector.trim() || null,
          address: registrationAddress.trim() || null,
          operation_addresses: normalizeOperationAddresses(operationAddresses),
          contact_email: contactEmail.trim() || null,
          assigned_collaborator_id: assignedCollaboratorId || null,
        };
        if (needsAgencyPick || !defaultAgencyId) {
          body.agency_id = agencyId;
        }

        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          client?: { id?: string };
        };
        if (!res.ok) {
          setError(json.error ?? m.common.error);
          return;
        }
        clientId = json.client?.id ?? null;
        setCreatedClientId(clientId);
      }

      if (employeePayloads.length > 0 && clientId) {
        const outcome = await postEmployees(clientId, employeePayloads);
        if (outcome.error) {
          setError(outcome.error);
          router.refresh();
          return;
        }
      }

      resetForm();
      setCreatedClientId(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bzr-btn-primary mt-6"
      >
        {c.addNew}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-4 rounded border border-ink/30 bg-ink/[0.02] p-4"
    >
      <h2 className="text-sm font-semibold text-ink">{c.newClient}</h2>

      {needsAgencyPick ? (
        <div>
          <label htmlFor="client-agency" className="block text-xs font-medium">
            {c.agency}
          </label>
          <select
            id="client-agency"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            required
            className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
          >
            <option value="">{c.selectAgency}</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="client-name" className="block text-xs font-medium">
          {c.companyName} *
        </label>
        <input
          id="client-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        />
      </div>

      <div>
        <label htmlFor="client-pib" className="block text-xs font-medium">
          {c.pib}
        </label>
        <input
          id="client-pib"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          inputMode="numeric"
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        />
      </div>

      <div>
        <label htmlFor="client-sector" className="block text-xs font-medium">
          {c.industry}
        </label>
        <input
          id="client-sector"
          value={activitySector}
          onChange={(e) => setActivitySector(e.target.value)}
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        />
      </div>

      <div>
        <label
          htmlFor="client-registration-address"
          className="block text-xs font-medium"
        >
          {c.registrationAddress}
        </label>
        <textarea
          id="client-registration-address"
          value={registrationAddress}
          onChange={(e) => setRegistrationAddress(e.target.value)}
          rows={2}
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        />
      </div>

      <OperationAddressesField
        idPrefix="client-op"
        values={operationAddresses}
        onChange={setOperationAddresses}
      />

      <div>
        <label htmlFor="client-email" className="block text-xs font-medium">
          {c.email}
        </label>
        <input
          id="client-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        />
      </div>

      <div>
        <label
          htmlFor="client-assigned"
          className="block text-xs font-medium"
        >
          {c.assignedCollaborator}
        </label>
        <select
          id="client-assigned"
          value={assignedCollaboratorId}
          onChange={(e) => setAssignedCollaboratorId(e.target.value)}
          className="bzr-input mt-1 max-w-md !rounded-lg !px-2 !py-1.5"
        >
          <option value="">{c.unassigned}</option>
          {collaborators.map((w) => (
            <option key={w.user_id} value={w.user_id}>
              {w.full_name}
            </option>
          ))}
        </select>
        {collaborators.length === 0 ? (
          <p className="mt-1 text-xs text-ink/55">{c.noCollaborators}</p>
        ) : null}
      </div>

      <ClientEmployeesEditor
        clientId={createdClientId}
        rows={employees}
        onRowsChange={setEmployees}
      />

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bzr-btn-primary"
        >
          {loading ? m.common.loading : m.common.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setCreatedClientId(null);
          }}
          className="bzr-btn-ghost"
        >
          {m.common.cancel}
        </button>
      </div>
    </form>
  );
}
