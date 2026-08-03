"use client";

import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import type { PendingAction } from "@/lib/agent/pending-action";

type Props = {
  action: PendingAction;
  onConfirmed: (successMessage: string) => void;
  onCancelled: () => void;
};

function DisplayRows({ action }: { action: PendingAction }) {
  const { m } = useTranslations();
  const c = m.dashboard.assistant.confirm;

  if (action.kind === "createFieldVisit") {
    const conflicts = action.display.conflicts;
    const conflictRows = [
      ...(conflicts?.worker_overlaps ?? []),
      ...(conflicts?.client_same_day ?? []),
    ];
    return (
      <div className="space-y-2">
        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-ink/55">{c.client}</dt>
            <dd className="font-medium text-ink">
              {action.display.client_name}
            </dd>
          </div>
          <div>
            <dt className="text-ink/55">{c.worker}</dt>
            <dd className="font-medium text-ink">
              {action.display.worker_name}
            </dd>
          </div>
          {action.display.visit_type_label ? (
            <div>
              <dt className="text-ink/55">{c.visitType}</dt>
              <dd className="font-medium text-ink">
                {action.display.visit_type_label}
              </dd>
            </div>
          ) : null}
          {action.display.duration_hours_label ? (
            <div>
              <dt className="text-ink/55">{c.durationHours}</dt>
              <dd className="font-medium text-ink">
                {action.display.duration_hours_label}
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-ink/55">{c.scheduledAt}</dt>
            <dd className="font-medium text-ink">
              {action.display.scheduled_at_label}
            </dd>
          </div>
        </dl>
        {conflictRows.length > 0 ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-ink/85">
            <p className="font-medium text-ink">{c.conflictsTitle}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {conflictRows.map((row, i) => (
                <li key={i}>
                  {row.broj_naloga ?? "—"}
                  {row.client_name ? ` · ${row.client_name}` : ""}
                  {row.assigned_user_name
                    ? ` · ${row.assigned_user_name}`
                    : ""}
                  {row.kind === "worker_overlap"
                    ? ` (${c.conflictWorker})`
                    : ` (${c.conflictClientDay})`}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-ink/65">{c.conflictsOverrideHint}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (action.kind === "updateComplianceRecordExpiry") {
    return (
      <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-ink/55">{c.client}</dt>
          <dd className="font-medium text-ink">{action.display.client_name}</dd>
        </div>
        <div>
          <dt className="text-ink/55">{c.subject}</dt>
          <dd className="font-medium text-ink">{action.display.subject_name}</dd>
        </div>
        <div>
          <dt className="text-ink/55">{c.recordType}</dt>
          <dd className="font-medium text-ink">
            {action.display.record_type_label}
          </dd>
        </div>
        <div>
          <dt className="text-ink/55">{c.category}</dt>
          <dd className="font-medium text-ink">{action.display.category}</dd>
        </div>
        <div>
          <dt className="text-ink/55">{c.currentExpiry}</dt>
          <dd className="font-medium text-ink">
            {action.display.current_expiry_label ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink/55">{c.newExpiry}</dt>
          <dd className="font-medium text-ink">
            {action.display.new_expiry_label}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
      <div>
        <dt className="text-ink/55">{c.client}</dt>
        <dd className="font-medium text-ink">{action.display.client_name}</dd>
      </div>
      <div>
        <dt className="text-ink/55">{c.collaborator}</dt>
        <dd className="font-medium text-ink">
          {action.display.collaborator_name}
        </dd>
      </div>
      {action.display.previous_collaborator_name ? (
        <div className="sm:col-span-2">
          <dt className="text-ink/55">{c.previousCollaborator}</dt>
          <dd className="font-medium text-ink">
            {action.display.previous_collaborator_name}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ActionConfirmCard({
  action,
  onConfirmed,
  onCancelled,
}: Props) {
  const { m } = useTranslations();
  const c = m.dashboard.assistant.confirm;
  const labels = c.kindLabels as Record<string, string>;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(action.execute.path, {
        method: action.execute.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.execute.body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }

      const successKey =
        action.kind === "createFieldVisit"
          ? c.successCreateVisit
          : action.kind === "updateComplianceRecordExpiry"
            ? c.successUpdateExpiry
            : c.successAssign;
      onConfirmed(successKey);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-accent/35 bg-accent/[0.04] p-4 shadow-[inset_0_0_0_1px_rgb(var(--color-accent)/0.06)]">
      <p className="bzr-eyebrow !text-[0.65rem] text-accent">{c.title}</p>
      <p className="mt-1 text-sm font-medium text-ink">
        {labels[action.kind] ?? action.kind}
      </p>
      <p className="mt-1 text-xs text-ink/70">{action.summary}</p>
      <div className="mt-3">
        <DisplayRows action={action} />
      </div>

      {error ? (
        <p className="mt-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="bzr-btn bzr-btn-primary"
        >
          {busy ? c.confirming : c.confirm}
        </button>
        <button
          type="button"
          onClick={onCancelled}
          disabled={busy}
          className="bzr-btn"
        >
          {c.cancel}
        </button>
      </div>
    </div>
  );
}
