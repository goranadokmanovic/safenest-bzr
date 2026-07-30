export type ReportLockStatus = "in_progress" | "closed";

export type ReportLockFields = {
  report_lock_status: ReportLockStatus;
  report_closed_at: string | null;
  report_closed_by: string | null;
  reopen_requested_at: string | null;
  reopen_requested_by: string | null;
  reopen_justification: string | null;
  reopen_approved_by: string | null;
  reopen_approved_at: string | null;
  signature_statement: string | null;
  report_content_hash: string | null;
};

export function normalizeReportLockStatus(value: unknown): ReportLockStatus {
  return value === "closed" ? "closed" : "in_progress";
}

/** Aktivan zahtev: zatvoren + requested posle poslednjeg odobrenja (ili bez odobrenja). */
export function hasActiveReopenRequest(lock: {
  report_lock_status: ReportLockStatus | string | null | undefined;
  reopen_requested_at: string | null | undefined;
  reopen_approved_at?: string | null | undefined;
}): boolean {
  if (lock.report_lock_status !== "closed" || !lock.reopen_requested_at) {
    return false;
  }
  if (!lock.reopen_approved_at) return true;
  return (
    new Date(lock.reopen_requested_at).getTime() >
    new Date(lock.reopen_approved_at).getTime()
  );
}

export const REPORT_LOCK_SELECT =
  "report_lock_status, report_closed_at, report_closed_by, reopen_requested_at, reopen_requested_by, reopen_justification, reopen_approved_by, reopen_approved_at, signature_statement, report_content_hash";
