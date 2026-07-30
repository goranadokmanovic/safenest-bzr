"use client";

import { useTranslations } from "@/components/i18n/locale-provider";

export type ToolTrace = {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  data?: unknown;
  error?: string;
};

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Row => !!asRecord(v));
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDateOnly(value: unknown): string {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return text(value);
  const [y, m, d] = raw.split("-");
  return `${d}.${m}.${y}.`;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return formatDateOnly(parsed.toISOString());
}

function statusBadgeClass(status: unknown): string {
  if (status === "expired") return "bzr-badge-danger";
  if (status === "expiring") return "bzr-badge-warning";
  return "bzr-badge-neutral";
}

function Shell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg border border-border/40 bg-surface/60 p-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink/55">
        {label}
      </p>
      <div className="mt-2 text-sm text-ink/85">{children}</div>
    </div>
  );
}

function DeadlinesTable({ data }: { data: Row }) {
  const rows = asRows(data.deadlines);
  if (rows.length === 0) return <p className="text-ink/60">—</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
        <thead>
          <tr className="text-ink/60">
            <th className="py-1 pr-3 font-medium">Klijent</th>
            <th className="py-1 pr-3 font-medium">Lice / oprema</th>
            <th className="py-1 pr-3 font-medium">Kategorija</th>
            <th className="py-1 pr-3 font-medium">Ističe</th>
            <th className="py-1 font-medium">Dana</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/25">
              <td className="py-1.5 pr-3">{text(row.client)}</td>
              <td className="py-1.5 pr-3">{text(row.subject)}</td>
              <td className="py-1.5 pr-3">{text(row.category)}</td>
              <td className="py-1.5 pr-3">{formatDateOnly(row.expiry_date)}</td>
              <td className="py-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.7rem] ${statusBadgeClass(row.status)}`}
                >
                  {text(row.days_remaining)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeesList({ data }: { data: Row }) {
  const rows = asRows(data.employees);
  if (rows.length === 0) return <p className="text-ink/60">—</p>;

  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row, i) => (
        <li key={i} className="flex flex-wrap gap-x-2">
          <span className="font-medium text-ink">{text(row.full_name)}</span>
          {row.position ? (
            <span className="text-ink/60">{text(row.position)}</span>
          ) : null}
          <span className="text-ink/45">{text(row.client)}</span>
        </li>
      ))}
    </ul>
  );
}

function VisitCounts({ data }: { data: Row }) {
  const rows = asRows(data.by_worker);

  return (
    <div className="space-y-2 text-xs">
      <p>
        <span className="text-ink/60">{text(data.period)}: </span>
        <span className="font-semibold text-ink">
          {text(data.total_visits)}
        </span>
      </p>
      {rows.length > 0 ? (
        <ul className="space-y-1">
          {rows.map((row, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{text(row.full_name)}</span>
              <span className="font-medium text-ink">
                {text(row.visit_count)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ClientSummary({ data }: { data: Row }) {
  const items: Array<[string, string]> = [
    ["Radnici (aktivni)", text(data.employees_active)],
    ["Posete ukupno", text(data.visits_total)],
    ["Posete (90 dana)", text(data.visits_last_90_days)],
    ["Poslednja poseta", formatDateTime(data.last_visit_at)],
    ["Istekli rokovi", text(data.compliance_expired)],
    ["Ističu za 30 dana", text(data.compliance_expiring_30d)],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-ink/55">{label}</dt>
          <dd className="font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VisitSearchList({ data }: { data: Row }) {
  const rows = asRows(data.visits);
  if (rows.length === 0) return <p className="text-ink/60">—</p>;

  return (
    <ul className="space-y-2 text-xs">
      {rows.map((row, i) => (
        <li key={i}>
          <p className="font-medium text-ink">
            {text(row.client)}
            <span className="ml-2 font-normal text-ink/55">
              {formatDateTime(row.scheduled_at)}
            </span>
          </p>
          {row.notes ? (
            <p className="mt-0.5 line-clamp-2 text-ink/70">{text(row.notes)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ToolBody({ trace }: { trace: ToolTrace }) {
  const data = asRecord(trace.data);
  if (!data) return <p className="text-ink/60">—</p>;

  if (data.status === "needs_clarification" || data.status === "client_not_found" || data.status === "worker_not_found") {
    const candidates = Array.isArray(data.candidates)
      ? (data.candidates as unknown[]).map(text)
      : [];
    return (
      <p className="text-xs text-ink/70">
        {candidates.length > 0 ? candidates.join(" · ") : "Nema poklapanja."}
      </p>
    );
  }

  switch (trace.name) {
    case "getUpcomingDeadlines":
      return <DeadlinesTable data={data} />;
    case "getEmployeesWithoutComplianceRecords":
      return <EmployeesList data={data} />;
    case "getVisitCountByAgencyUser":
      return <VisitCounts data={data} />;
    case "getClientSummary":
      return <ClientSummary data={data} />;
    case "searchFieldVisits":
      return <VisitSearchList data={data} />;
    default:
      return <p className="text-ink/60">—</p>;
  }
}

export function ToolTraceCard({ traces }: { traces: ToolTrace[] }) {
  const { m } = useTranslations();
  const a = m.dashboard.assistant;

  if (traces.length === 0) return null;

  const labels = a.toolLabels as Record<string, string>;

  return (
    <div className="mt-2">
      {traces.map((trace, index) => (
        <Shell
          key={`${trace.name}-${index}`}
          label={labels[trace.name] ?? trace.name}
        >
          {trace.ok ? (
            <ToolBody trace={trace} />
          ) : (
            <p className="text-xs text-danger">
              {a.toolFailed}: {trace.error ?? "—"}
            </p>
          )}
        </Shell>
      ))}
    </div>
  );
}
