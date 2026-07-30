"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  formatOperationAddressesSummary,
  parseOperationAddresses,
} from "@/components/admin/operation-addresses-field";

export type CollaboratorOption = {
  user_id: string;
  full_name: string;
};

export type ClientRow = {
  id: string;
  name: string;
  tax_id: string | null;
  activity_sector: string | null;
  address: string | null;
  operation_addresses: string[] | null;
  contact_email: string | null;
  created_at: string;
  agency_id: string;
  agency_name: string | null;
  assigned_collaborator_id: string | null;
  assigned_collaborator_name: string | null;
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "sr-RS");
  } catch {
    return iso;
  }
}

function CellText({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block break-words text-[0.8125rem] leading-snug"
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
}

type Props = {
  clients: ClientRow[];
};

export function ClientsList({ clients }: Props) {
  const router = useRouter();
  const { m, locale } = useTranslations();
  const c = m.admin.clients;

  if (clients.length === 0) {
    return <p className="mt-8 text-sm text-ink/70">{c.noClients}</p>;
  }

  return (
    <div className="bzr-table-wrap bzr-clients-table mt-8">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th className="w-[16%]">{c.colName}</th>
            <th className="w-[10%]">{c.colPib}</th>
            <th className="w-[12%]">{c.colIndustry}</th>
            <th className="w-[14%]">{c.colRegistrationAddress}</th>
            <th className="w-[14%]">{c.colOperationAddresses}</th>
            <th className="w-[14%]">{c.colEmail}</th>
            <th className="w-[11%]">{c.colAssignedCollaborator}</th>
            <th className="w-[9%]">{c.colCreated}</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((row) => {
            const assignedLabel =
              row.assigned_collaborator_name ?? c.unassigned;
            const openDetail = () => {
              router.push(`/agencija/klijenti/${row.id}`);
            };

            return (
              <tr
                key={row.id}
                className="bzr-client-row"
                role="link"
                tabIndex={0}
                aria-label={row.name}
                onClick={openDetail}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openDetail();
                  }
                }}
              >
                <td>
                  <CellText>{row.name}</CellText>
                </td>
                <td>
                  <CellText>{row.tax_id ?? m.common.noData}</CellText>
                </td>
                <td>
                  <CellText>
                    {row.activity_sector ?? m.common.noData}
                  </CellText>
                </td>
                <td>
                  <CellText>{row.address ?? m.common.noData}</CellText>
                </td>
                <td>
                  <CellText>
                    {formatOperationAddressesSummary(
                      parseOperationAddresses(row.operation_addresses),
                      m.common.noData,
                    )}
                  </CellText>
                </td>
                <td>
                  <CellText>{row.contact_email ?? m.common.noData}</CellText>
                </td>
                <td>
                  <span
                    className={
                      row.assigned_collaborator_id
                        ? "bzr-badge-success"
                        : "bzr-badge-neutral"
                    }
                    title={assignedLabel}
                  >
                    {assignedLabel}
                  </span>
                </td>
                <td className="text-xs text-ink/80">
                  <CellText>{formatDate(row.created_at, locale)}</CellText>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
