"use client";

import { useTranslations } from "@/components/i18n/locale-provider";
import type { SyncStatus, VisitStatus } from "@/lib/field-visits/display";

const SYNC_STYLES: Record<SyncStatus, string> = {
  synced: "bzr-badge-success",
  pending: "bzr-badge-warning",
  failed: "bzr-badge-danger",
};

const SYNC_ICONS: Record<SyncStatus, string> = {
  synced: "●",
  pending: "●",
  failed: "●",
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const label =
    status === "synced"
      ? fv.syncSynced
      : status === "failed"
        ? fv.syncFailed
        : fv.syncPending;

  return (
    <span className={SYNC_STYLES[status]}>
      <span aria-hidden className="text-[0.55rem] leading-none">
        {SYNC_ICONS[status]}
      </span>
      {label}
    </span>
  );
}

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const label =
    status === "draft"
      ? fv.visitStatusDraft
      : status === "in_progress"
        ? fv.visitStatusInProgress
        : status === "completed"
          ? fv.visitStatusCompleted
          : fv.visitStatusCancelled;

  const style =
    status === "completed"
      ? "bzr-badge-success"
      : status === "cancelled"
        ? "bzr-badge-danger"
        : status === "in_progress"
          ? "bzr-badge-warning"
          : "bzr-badge-neutral";

  return <span className={style}>{label}</span>;
}

export function ReportLockBadge({
  status,
  reopenPending = false,
  signatureLine = null,
  awaitingNames = [],
}: {
  status: "in_progress" | "closed";
  reopenPending?: boolean;
  /** Pun statement npr. „Zatvoren i potpisao …” — prikaz pored statusa. */
  signatureLine?: string | null;
  /** Imena koja još nisu potpisala (delimično potpisivanje). */
  awaitingNames?: string[];
}) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;

  if (status === "closed") {
    return (
      <span className="inline-flex max-w-full flex-col items-start gap-1">
        <span className="bzr-badge-neutral">
          <span aria-hidden>🔒</span>
          {fv.reportLockClosed}
        </span>
        {signatureLine ? (
          <span className="max-w-md text-xs italic leading-snug text-ink/75">
            {signatureLine}
          </span>
        ) : null}
        {reopenPending ? (
          <span className="bzr-badge-warning text-[10px]">
            {fv.reportLockReopenPending}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <span className="bzr-badge-warning">{fv.reportLockInProgress}</span>
      {signatureLine ? (
        <span className="max-w-md text-xs italic leading-snug text-ink/75">
          {signatureLine}
        </span>
      ) : null}
      {awaitingNames.length > 0 ? (
        <span className="text-[11px] text-ink/60">
          {fv.reportSignaturesWaiting}: {awaitingNames.join(", ")}
        </span>
      ) : null}
    </span>
  );
}
