"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  formatDurationHours,
  formatVisitDate,
  metaStr,
  normalizeRiskLevel,
  normalizeSyncStatus,
  normalizeVisitStatus,
  visitNotes,
} from "@/lib/field-visits/display";
import type { FieldVisitDisplayRow } from "@/components/field-visits/FieldVisitsList";
import { RiskBadge } from "@/components/field-visits/RiskBadge";
import { FieldVisitPhotosGallery } from "@/components/field-visits/FieldVisitPhotosGallery";
import {
  ReportLockBadge,
  SyncStatusBadge,
  VisitStatusBadge,
} from "@/components/field-visits/VisitStatusBadges";
import { ReportFieldsEditor } from "@/components/field-visits/ReportFieldsEditor";
import { VisitTeamPanel } from "@/components/field-visits/VisitTeamPanel";
import { ReportPrintView } from "@/components/field-visits/ReportPrintView";
import type { ReportFields } from "@/lib/api/report-fields";
import {
  hasActiveReopenRequest,
  normalizeReportLockStatus,
  type ReportLockStatus,
} from "@/lib/api/report-lock";
import type {
  VisitAssignee,
  VisitSignatureRow,
} from "@/lib/api/report-signature";
import { useRouter } from "next/navigation";

type TranscriptStatus = "pending" | "processing" | "done" | "failed";
type ReportStatus = "pending" | "processing" | "done" | "failed" | "skipped";
type NoiseMode = "quiet" | "noisy";

type Props = {
  row: FieldVisitDisplayRow;
  onClose: () => void;
  /** Otvori originalnu posetu (kontrolna veza). */
  onOpenParentVisit?: (parentId: string) => void;
  /** Brisanje posete (posle potvrde u modalu). */
  onDelete?: (row: FieldVisitDisplayRow) => Promise<void>;
  deleteLoading?: boolean;
  deleteError?: string | null;
  workers?: Array<{ user_id: string; full_name: string; email: string }>;
  agencyName?: string;
  currentUserId?: string | null;
  canManageTeam?: boolean;
  /** Ako je setovan (npr. iz kalendara), prikaži Nazad i zatvaranje vodi tamo. */
  backHref?: string | null;
};

function normalizeStatus(value: unknown): TranscriptStatus {
  if (
    value === "processing" ||
    value === "done" ||
    value === "failed" ||
    value === "pending"
  ) {
    return value;
  }
  return "pending";
}

function normalizeReportStatus(value: unknown): ReportStatus {
  if (
    value === "processing" ||
    value === "done" ||
    value === "failed" ||
    value === "pending" ||
    value === "skipped"
  ) {
    return value;
  }
  return "pending";
}

function normalizeFields(value: unknown): ReportFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: ReportFields = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeAssignees(value: unknown): VisitAssignee[] {
  if (!Array.isArray(value)) return [];
  const out: VisitAssignee[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.user_id !== "string" || typeof row.full_name !== "string") {
      continue;
    }
    const role =
      row.role === "collaborator" || row.role === "primary"
        ? row.role
        : "collaborator";
    out.push({
      user_id: row.user_id,
      full_name: row.full_name,
      email: typeof row.email === "string" ? row.email : null,
      role,
    });
  }
  return out;
}

function normalizeSignatures(value: unknown): VisitSignatureRow[] {
  if (!Array.isArray(value)) return [];
  const out: VisitSignatureRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.user_id !== "string" ||
      typeof row.full_name !== "string" ||
      typeof row.signature_statement !== "string"
    ) {
      continue;
    }
    out.push({
      user_id: row.user_id,
      full_name: row.full_name,
      signed_at: typeof row.signed_at === "string" ? row.signed_at : "",
      signature_statement: row.signature_statement,
      report_content_hash:
        typeof row.report_content_hash === "string"
          ? row.report_content_hash
          : null,
    });
  }
  return out;
}

type LockPayload = {
  report_lock_status?: ReportLockStatus | string;
  report_closed_at?: string | null;
  reopen_requested_at?: string | null;
  reopen_justification?: string | null;
  reopen_approved_at?: string | null;
  reopen_request_active?: boolean;
  can_approve_reopen?: boolean;
  signature_statement?: string | null;
  report_content_hash?: string | null;
  assignees?: VisitAssignee[];
  signatures?: VisitSignatureRow[];
  current_user_signed?: boolean;
  all_signed?: boolean;
};

type VisitFetchBody = {
  field_visit?: {
    audio_url?: string | null;
    audio_src?: string | null;
    transcript?: string | null;
    transcript_status?: TranscriptStatus;
    noise_mode?: NoiseMode | null;
    report_template_id?: string | null;
    report?: string | null;
    report_fields?: ReportFields | null;
    report_status?: ReportStatus;
    report_lock_status?: ReportLockStatus | string;
    report_closed_at?: string | null;
    reopen_requested_at?: string | null;
    reopen_justification?: string | null;
    reopen_approved_at?: string | null;
    can_approve_reopen?: boolean;
    signature_statement?: string | null;
    report_content_hash?: string | null;
    assigned_user_id?: string | null;
    updated_at?: string | null;
    assignees?: VisitAssignee[];
    signatures?: VisitSignatureRow[];
    current_user_signed?: boolean;
  };
  error?: string;
};

export function FieldVisitsModal({
  row,
  onClose,
  onOpenParentVisit,
  onDelete,
  deleteLoading = false,
  deleteError = null,
  workers,
  agencyName,
  currentUserId: _currentUserId,
  canManageTeam,
  backHref = null,
}: Props) {
  const { m, locale } = useTranslations();
  const router = useRouter();
  const fv = m.dashboard.fieldVisits;

  function handleDismiss() {
    if (backHref) {
      router.push(backHref);
      return;
    }
    onClose();
  }
  const ff = fv.form;
  const meta = row.metadata ?? {};
  const syncStatus = normalizeSyncStatus(row.sync_status, row.isLocal);
  const visitStatus = normalizeVisitStatus(row.status);
  const risk = normalizeRiskLevel(metaStr(meta, "risk_level"));
  const notes = visitNotes(row.notes, meta);
  const justSavedRef = useRef(false);
  const loadedUpdatedAtRef = useRef<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(Boolean(row.audio_url));
  const [noiseMode, setNoiseMode] = useState<NoiseMode | null>(row.noise_mode);
  const [transcript, setTranscript] = useState(row.transcript ?? "");
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>(
    normalizeStatus(row.transcript_status),
  );
  const [loadingAudio, setLoadingAudio] = useState(!row.isLocal);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [transcriptMessage, setTranscriptMessage] = useState<string | null>(
    null,
  );
  const [report, setReport] = useState(row.report ?? "");
  const [reportFields, setReportFields] = useState<ReportFields | null>(
    row.report_fields ?? null,
  );
  const [reportStatus, setReportStatus] = useState<ReportStatus>(
    normalizeReportStatus(row.report_status),
  );
  const [hasReportTemplate, setHasReportTemplate] = useState(
    Boolean(row.report_template_id),
  );
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportLockStatus, setReportLockStatus] = useState<ReportLockStatus>(
    normalizeReportLockStatus(row.report_lock_status),
  );
  const [reopenRequestedAt, setReopenRequestedAt] = useState<string | null>(
    row.reopen_requested_at ?? null,
  );
  const [reopenJustification, setReopenJustification] = useState(
    row.reopen_justification ?? "",
  );
  const [reopenApprovedAt, setReopenApprovedAt] = useState<string | null>(
    row.reopen_approved_at ?? null,
  );
  const [canApproveReopen, setCanApproveReopen] = useState(false);
  const [reopenDraft, setReopenDraft] = useState("");
  const [lockBusy, setLockBusy] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [signatureStatement, setSignatureStatement] = useState<string | null>(
    row.signature_statement ?? null,
  );
  const [assignees, setAssignees] = useState<VisitAssignee[]>([]);
  const [signatures, setSignatures] = useState<VisitSignatureRow[]>([]);
  const [currentUserSigned, setCurrentUserSigned] = useState(false);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(
    row.assigned_user_id ?? null,
  );

  useEffect(() => {
    loadedUpdatedAtRef.current = loadedUpdatedAt;
  }, [loadedUpdatedAt]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  /* Portal na body — inače sidebar (z-60) prekriva levi stubac jer je
     shell-main stacking context samo z-1 (isti razlog kao Zrna / import dialog). */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* Prikaz zauzima celu stranicu — Escape je najbrži izlaz. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (backHref) router.push(backHref);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, backHref, router]);

  function applyLockPayload(payload: LockPayload) {
    if (payload.report_lock_status !== undefined) {
      setReportLockStatus(
        normalizeReportLockStatus(payload.report_lock_status),
      );
    }
    if (payload.reopen_requested_at !== undefined) {
      setReopenRequestedAt(payload.reopen_requested_at);
    }
    if (payload.reopen_justification !== undefined) {
      setReopenJustification(payload.reopen_justification ?? "");
    }
    if (payload.reopen_approved_at !== undefined) {
      setReopenApprovedAt(payload.reopen_approved_at);
    }
    if (payload.can_approve_reopen !== undefined) {
      setCanApproveReopen(payload.can_approve_reopen);
    }
    if (payload.signature_statement !== undefined) {
      setSignatureStatement(payload.signature_statement);
    }
    if (payload.assignees !== undefined) {
      setAssignees(normalizeAssignees(payload.assignees));
    }
    if (payload.signatures !== undefined) {
      setSignatures(normalizeSignatures(payload.signatures));
    }
    if (payload.current_user_signed !== undefined) {
      setCurrentUserSigned(Boolean(payload.current_user_signed));
    }
  }

  const reopenPending = hasActiveReopenRequest({
    report_lock_status: reportLockStatus,
    reopen_requested_at: reopenRequestedAt,
    reopen_approved_at: reopenApprovedAt,
  });
  const reportLocked = reportLockStatus === "closed";
  const reportLockedForUser = reportLocked || currentUserSigned;
  const signedIds = new Set(signatures.map((s) => s.user_id));
  const awaitingNames = assignees
    .filter((a) => !signedIds.has(a.user_id))
    .map((a) => a.full_name);
  const latestSignatureLine = signatures.length
    ? signatures[signatures.length - 1].signature_statement
    : signatureStatement;

  useEffect(() => {
    if (row.isLocal) {
      setLoadingAudio(false);
      return;
    }

    let cancelled = false;
    setLoadingAudio(true);
    setStaleWarning(false);

    async function loadVisit(opts?: { poll?: boolean }) {
      try {
        const response = await fetch(`/api/field-visits/${row.id}`);
        const body = (await response
          .json()
          .catch(() => ({}))) as VisitFetchBody;
        if (cancelled) return;
        if (!response.ok || !body.field_visit) {
          if (!opts?.poll) setLoadingAudio(false);
          return;
        }

        const visit = body.field_visit;
        const serverUpdatedAt =
          typeof visit.updated_at === "string" ? visit.updated_at : null;

        if (opts?.poll) {
          const prev = loadedUpdatedAtRef.current;
          if (serverUpdatedAt && prev && serverUpdatedAt !== prev) {
            if (justSavedRef.current) {
              justSavedRef.current = false;
              setLoadedUpdatedAt(serverUpdatedAt);
            } else {
              setStaleWarning(true);
            }
          }
          return;
        }

        setHasAudio(Boolean(visit.audio_url));
        setAudioSrc(visit.audio_src ?? null);
        setTranscript(visit.transcript ?? "");
        setTranscriptStatus(normalizeStatus(visit.transcript_status));
        setNoiseMode(
          visit.noise_mode === "quiet" || visit.noise_mode === "noisy"
            ? visit.noise_mode
            : null,
        );
        setHasReportTemplate(Boolean(visit.report_template_id));
        setReport(visit.report ?? "");
        setReportFields(normalizeFields(visit.report_fields));
        setReportStatus(normalizeReportStatus(visit.report_status));
        setAssignees(normalizeAssignees(visit.assignees));
        setSignatures(normalizeSignatures(visit.signatures));
        setCurrentUserSigned(Boolean(visit.current_user_signed));
        if (visit.signature_statement !== undefined) {
          setSignatureStatement(visit.signature_statement);
        }
        setAssignedUserId(visit.assigned_user_id ?? null);
        setLoadedUpdatedAt(serverUpdatedAt);
        setStaleWarning(false);
        applyLockPayload(visit);
      } catch {
        /* ostavi vrednosti iz liste */
      } finally {
        if (!cancelled && !opts?.poll) setLoadingAudio(false);
      }
    }

    void loadVisit();

    const pollId = window.setInterval(() => {
      void loadVisit({ poll: true });
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [row.id, row.isLocal]);

  const showAudioSection =
    !row.isLocal &&
    (hasAudio ||
      Boolean(transcript.trim()) ||
      transcriptStatus !== "pending" ||
      loadingAudio);

  const hasStructuredFields =
    Boolean(reportFields && Object.keys(reportFields).length > 0) ||
    Boolean(report.trim());

  const showReportSection =
    !row.isLocal &&
    (hasReportTemplate ||
      hasStructuredFields ||
      reportStatus !== "pending" ||
      loadingAudio);

  async function saveTranscript() {
    setSavingTranscript(true);
    setTranscriptMessage(null);
    try {
      const response = await fetch(`/api/field-visits/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        transcript_status?: TranscriptStatus;
      };
      if (!response.ok) {
        setTranscriptMessage(body.error ?? m.common.error);
        return;
      }
      justSavedRef.current = true;
      setTranscriptStatus(body.transcript_status ?? "done");
      setTranscriptMessage(fv.transcriptSaved);
    } catch {
      setTranscriptMessage(m.common.networkError);
    } finally {
      setSavingTranscript(false);
    }
  }

  async function retryTranscription() {
    setTranscriptStatus("processing");
    setTranscriptMessage(null);
    setReportStatus("processing");
    try {
      const response = await fetch(`/api/field-visits/${row.id}/transcribe`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        transcript?: string;
        report?: string | null;
        report_fields?: ReportFields | null;
        report_status?: ReportStatus;
      };
      if (!response.ok) {
        setTranscriptStatus("failed");
        setTranscriptMessage(body.error ?? m.common.error);
        setReportStatus("failed");
        return;
      }
      justSavedRef.current = true;
      setTranscript(body.transcript ?? "");
      setTranscriptStatus("done");
      setReport(body.report ?? "");
      setReportFields(normalizeFields(body.report_fields));
      setReportStatus(normalizeReportStatus(body.report_status));
    } catch {
      setTranscriptStatus("failed");
      setTranscriptMessage(m.common.networkError);
      setReportStatus("failed");
    }
  }

  async function retryReport() {
    if (reportLockedForUser) return;
    setReportStatus("processing");
    setReportMessage(null);
    try {
      const response = await fetch(
        `/api/field-visits/${row.id}/generate-report`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: string | null;
        report_fields?: ReportFields | null;
        report_status?: ReportStatus;
      };
      if (!response.ok) {
        setReportStatus("failed");
        setReportMessage(body.error ?? m.common.error);
        return;
      }
      justSavedRef.current = true;
      setReport(body.report ?? "");
      setReportFields(normalizeFields(body.report_fields));
      setReportStatus(normalizeReportStatus(body.report_status));
    } catch {
      setReportStatus("failed");
      setReportMessage(m.common.networkError);
    }
  }

  function requestCloseReport() {
    if (lockBusy || reportLocked || currentUserSigned) return;
    setCloseConfirmOpen(true);
  }

  async function confirmCloseAndSign() {
    if (lockBusy || reportLocked || currentUserSigned) return;
    setLockBusy(true);
    setReportMessage(null);
    try {
      const response = await fetch(`/api/field-visits/${row.id}/close-report`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as LockPayload & {
        error?: string;
      };
      if (!response.ok) {
        setReportMessage(body.error ?? m.common.error);
        return;
      }
      justSavedRef.current = true;
      applyLockPayload(body);
      setCloseConfirmOpen(false);
      setReportMessage(
        body.all_signed === false ? fv.reportSignedPartial : fv.reportClosed,
      );
      router.refresh();
    } catch {
      setReportMessage(m.common.networkError);
    } finally {
      setLockBusy(false);
    }
  }

  async function requestReopen() {
    if (lockBusy || !reportLocked) return;
    const justification = reopenDraft.trim();
    if (!justification) {
      setReportMessage(fv.reportReopenJustificationRequired);
      return;
    }
    setLockBusy(true);
    setReportMessage(null);
    try {
      const response = await fetch(
        `/api/field-visits/${row.id}/request-reopen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ justification }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as LockPayload & {
        error?: string;
      };
      if (!response.ok) {
        setReportMessage(body.error ?? m.common.error);
        return;
      }
      justSavedRef.current = true;
      applyLockPayload(body);
      setReopenDraft("");
      setReportMessage(fv.reportReopenSubmitted);
      router.refresh();
    } catch {
      setReportMessage(m.common.networkError);
    } finally {
      setLockBusy(false);
    }
  }

  async function approveReopen() {
    if (lockBusy || !canApproveReopen) return;
    setLockBusy(true);
    setReportMessage(null);
    try {
      const response = await fetch(
        `/api/field-visits/${row.id}/approve-reopen`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as LockPayload & {
        error?: string;
      };
      if (!response.ok) {
        setReportMessage(body.error ?? m.common.error);
        return;
      }
      justSavedRef.current = true;
      applyLockPayload(body);
      setReportMessage(fv.reportReopenApproved);
      router.refresh();
    } catch {
      setReportMessage(m.common.networkError);
    } finally {
      setLockBusy(false);
    }
  }

  const reportEditable =
    reportStatus !== "processing" && reportStatus !== "skipped";

  if (!mounted) return null;

  return createPortal(
    <div
      className="bzr-field-visit-detail fixed inset-0 z-[50] flex flex-col bg-bg lg:left-[19rem]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-visit-modal-title"
    >
      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/30 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            {backHref ? (
              <Link href={backHref} className="bzr-back mb-2 inline-flex">
                {fv.backToCalendar}
              </Link>
            ) : null}
            <h3
              id="field-visit-modal-title"
              className="font-display text-xl font-semibold leading-tight text-ink"
            >
              {fv.detailsTitle}
            </h3>
            <p className="mt-0.5 truncate text-xs text-ink/60">
              {[row.broj_naloga, row.client_name].filter(Boolean).join(" · ")}
            </p>
            {staleWarning ? (
              <p className="mt-1 text-xs text-warning" role="status">
                {fv.reportStaleWarning}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onDelete ? (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="bzr-btn-danger bzr-btn-sm"
              >
                {m.common.delete}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDismiss}
              className="bzr-btn-ghost"
            >
              {fv.close}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={fv.close}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/40 text-xl leading-none text-ink/60 hover:bg-ink/5 hover:text-ink"
            >
              ×
            </button>
          </div>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 gap-8 overflow-hidden px-6 py-5 sm:px-10 lg:grid-cols-2 lg:gap-12 xl:grid-cols-3 xl:gap-14">
          <section className="bzr-visit-detail-col min-h-0 min-w-0 overflow-auto overscroll-contain pr-2">
            <dl className="space-y-1.5 text-sm">
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">
                  {fv.detailBrojNaloga}
                </dt>
                <dd className="min-w-0 font-medium tabular-nums">
                  {row.broj_naloga ?? m.common.noData}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailClient}</dt>
                <dd className="min-w-0">{row.client_name ?? m.common.noData}</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailIndustry}</dt>
                <dd className="min-w-0">
                  {row.client_industry ?? m.common.noData}
                </dd>
              </div>
              {row.parent_visit_id ? (
                <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                  <dt className="font-medium text-ink/70">
                    {fv.detailControlOf}
                  </dt>
                  <dd className="min-w-0">
                    {onOpenParentVisit ? (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => onOpenParentVisit(row.parent_visit_id!)}
                      >
                        {fv.detailControlOfValue.replace(
                          "{broj}",
                          row.parent_broj_naloga ??
                            row.parent_visit_id.slice(0, 8),
                        )}
                      </button>
                    ) : (
                      <span>
                        {fv.detailControlOfValue.replace(
                          "{broj}",
                          row.parent_broj_naloga ??
                            row.parent_visit_id.slice(0, 8),
                        )}
                      </span>
                    )}
                  </dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">
                  {fv.detailHitnoOtklanjanje}
                </dt>
                <dd className="min-w-0">
                  {row.hitno_otklanjanje ? (
                    <span className="font-semibold text-red-800">
                      {fv.filterHitnoYes}
                    </span>
                  ) : (
                    fv.filterHitnoNo
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailRisk}</dt>
                <dd className="min-w-0">
                  {risk ? <RiskBadge level={risk} /> : m.common.noData}
                </dd>
              </div>
              {row.isLocal ? (
                <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                  <dt className="font-medium text-ink/70">
                    {fv.detailAssignedUser}
                  </dt>
                  <dd className="min-w-0">
                    {row.assigned_user_name ??
                      row.assigned_user_id?.slice(0, 8) ??
                      m.common.noData}
                  </dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">
                  {fv.detailVisitStatus}
                </dt>
                <dd className="min-w-0">
                  <VisitStatusBadge status={visitStatus} />
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailSync}</dt>
                <dd className="min-w-0">
                  <SyncStatusBadge status={syncStatus} />
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailDuration}</dt>
                <dd className="min-w-0">
                  {formatDurationHours(meta, fv.hoursSuffix, {
                    started_at: row.started_at,
                    completed_at: row.completed_at,
                  }) ??
                    (visitStatus === "in_progress"
                      ? fv.durationInProgress
                      : m.common.noData)}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailScheduled}</dt>
                <dd className="min-w-0">
                  {formatVisitDate(row.scheduled_at, locale)}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailStarted}</dt>
                <dd className="min-w-0">
                  {formatVisitDate(row.started_at, locale)}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 border-b border-ink/10 py-1">
                <dt className="font-medium text-ink/70">{fv.detailCompleted}</dt>
                <dd className="min-w-0">
                  {formatVisitDate(row.completed_at, locale)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="bzr-visit-detail-col min-h-0 min-w-0 overflow-auto overscroll-contain border-l border-border/25 pl-6 pr-2 lg:pl-8">
            <dl className="space-y-5 text-sm">
              {!row.isLocal ? (
                <div className="relative z-10">
                  <VisitTeamPanel
                    visitId={row.id}
                    assignees={
                      assignees.length
                        ? assignees
                        : row.assigned_user_name
                          ? [
                              {
                                user_id:
                                  assignedUserId ?? row.assigned_user_id ?? "",
                                full_name: row.assigned_user_name,
                                role: "primary",
                              },
                            ]
                          : []
                    }
                    workers={workers ?? []}
                    canManage={Boolean(canManageTeam)}
                    disabled={reportLocked}
                    onChange={setAssignees}
                  />
                </div>
              ) : null}
              <div>
                <dt className="font-medium text-ink/70">{fv.detailNotes}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink/90">
                  {notes ?? m.common.noData}
                </dd>
              </div>
              {metaStr(meta, "extracted_text") ? (
                <div>
                  <dt className="font-medium text-ink/70">{fv.detailOcr}</dt>
                  <dd className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap rounded border border-ink/20 bg-ink/[0.02] p-2 text-xs">
                    {metaStr(meta, "extracted_text")}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="font-medium text-ink/70">{fv.detailPhotos}</dt>
                <dd className="mt-1">
                  <FieldVisitPhotosGallery
                    serverPhotos={row.isLocal ? undefined : row.photos}
                    localVisitId={row.isLocal ? row.localId : undefined}
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section className="bzr-visit-detail-col min-h-0 min-w-0 overflow-auto overscroll-contain border-l border-border/25 pl-6 pr-2 lg:pl-8">
            <dl className="space-y-5 text-sm">
              {showAudioSection ? (
                <div className="py-2">
                  <dt className="font-medium text-ink/70">{fv.detailAudio}</dt>
                  <dd className="mt-2 space-y-3">
                    {loadingAudio ? (
                      <p className="text-xs text-ink/60">{fv.audioLoading}</p>
                    ) : null}

                    {audioSrc ? (
                      <audio controls src={audioSrc} className="w-full" />
                    ) : hasAudio && !loadingAudio ? (
                      <p className="text-xs text-ink/60">
                        {fv.audioUnavailable}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink/70">
                      {transcriptStatus === "processing" ||
                      transcriptStatus === "pending" ? (
                        <span
                          className="h-3 w-3 animate-spin rounded-full border-2 border-ink/20 border-t-ink"
                          aria-hidden
                        />
                      ) : null}
                      <span>
                        {transcriptStatus === "processing"
                          ? fv.transcriptProcessing
                          : transcriptStatus === "done"
                            ? fv.transcriptDone
                            : transcriptStatus === "failed"
                              ? fv.transcriptFailed
                              : fv.transcriptPending}
                      </span>
                      {noiseMode ? (
                        <span className="rounded border border-ink/20 bg-ink/[0.04] px-1.5 py-0.5">
                          {noiseMode === "noisy"
                            ? ff.noisyEnvironment
                            : ff.quietEnvironment}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium text-ink/70">
                        {fv.detailTranscript}
                      </p>
                      <textarea
                        value={transcript}
                        onChange={(event) => setTranscript(event.target.value)}
                        rows={7}
                        disabled={
                          transcriptStatus === "processing" || savingTranscript
                        }
                        className="w-full rounded-lg border border-border/40 px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent disabled:bg-ink/[0.03]"
                        placeholder={fv.transcriptPlaceholder}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveTranscript()}
                        disabled={
                          transcriptStatus === "processing" || savingTranscript
                        }
                        className="bzr-btn-primary bzr-btn-sm"
                      >
                        {savingTranscript
                          ? fv.transcriptSaving
                          : fv.transcriptSave}
                      </button>
                      {transcriptStatus === "failed" ? (
                        <button
                          type="button"
                          onClick={() => void retryTranscription()}
                          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
                        >
                          {fv.transcriptRetry}
                        </button>
                      ) : null}
                      {transcriptMessage ? (
                        <span className="text-xs text-ink/70" role="status">
                          {transcriptMessage}
                        </span>
                      ) : null}
                    </div>
                  </dd>
                </div>
              ) : null}

              {showReportSection ? (
                <div className="py-2">
                  <dt className="font-medium text-ink/70">{fv.detailReport}</dt>
                  <dd className="mt-2 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink/70">
                      {reportStatus === "processing" ||
                      reportStatus === "pending" ? (
                        <span
                          className="h-3 w-3 animate-spin rounded-full border-2 border-ink/20 border-t-ink"
                          aria-hidden
                        />
                      ) : null}
                      <span>
                        {reportStatus === "processing"
                          ? fv.reportProcessing
                          : reportStatus === "done"
                            ? fv.reportDone
                            : reportStatus === "failed"
                              ? fv.reportFailed
                              : reportStatus === "skipped"
                                ? fv.reportSkipped
                                : fv.reportPending}
                      </span>
                      <ReportLockBadge
                        status={reportLockStatus}
                        reopenPending={reopenPending}
                        signatureLine={latestSignatureLine}
                        awaitingNames={!reportLocked ? awaitingNames : []}
                      />
                    </div>

                    {reportEditable || reportLocked || currentUserSigned ? (
                      <ReportFieldsEditor
                        visitId={row.id}
                        initialFields={reportFields}
                        legacyReportText={report}
                        disabled={!reportEditable || reportLockedForUser}
                        locked={reportLockedForUser}
                        onSaved={(next) => {
                          justSavedRef.current = true;
                          setReportFields(next);
                          setReportStatus("done");
                        }}
                      />
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {!reportLockedForUser &&
                      (reportStatus === "failed" ||
                        (reportStatus === "skipped" && hasReportTemplate)) ? (
                        <button
                          type="button"
                          onClick={() => void retryReport()}
                          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
                        >
                          {fv.reportRetry}
                        </button>
                      ) : null}
                      {!reportLocked && !currentUserSigned && reportEditable ? (
                        <button
                          type="button"
                          onClick={requestCloseReport}
                          disabled={lockBusy}
                          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {lockBusy ? fv.reportClosing : fv.reportClose}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
                      >
                        {fv.reportPrint}
                      </button>
                      {reportMessage ? (
                        <span className="text-xs text-ink/70" role="status">
                          {reportMessage}
                        </span>
                      ) : null}
                    </div>

                    {signatures.length > 0 ? (
                      <aside
                        className="space-y-2 border border-ink/25 bg-ink/[0.04] px-3 py-3"
                        aria-label={fv.reportSignatureTitle}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                          {fv.reportSignatureTitle}
                        </p>
                        {signatures.map((sig) => (
                          <p
                            key={`${sig.user_id}-${sig.signed_at}`}
                            className="text-sm italic leading-relaxed text-ink/85"
                          >
                            {sig.signature_statement}
                          </p>
                        ))}
                      </aside>
                    ) : signatureStatement ? (
                      <aside
                        className="flex gap-3 border border-ink/25 bg-ink/[0.04] px-3 py-3"
                        aria-label={fv.reportSignatureTitle}
                      >
                        <span
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-ink/30 bg-surface text-base text-ink/70"
                          aria-hidden
                        >
                          ✎
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                            {fv.reportSignatureTitle}
                          </p>
                          <p className="mt-1 text-sm italic leading-relaxed text-ink/85">
                            {signatureStatement}
                          </p>
                        </div>
                      </aside>
                    ) : null}

                    {awaitingNames.length > 0 && !reportLocked ? (
                      <p className="text-xs text-ink/70" role="status">
                        {fv.reportSignaturesWaiting}: {awaitingNames.join(", ")}
                      </p>
                    ) : null}

                    {currentUserSigned && !reportLocked ? (
                      <p className="text-xs text-ink/70" role="status">
                        {fv.reportAlreadySignedHint}
                      </p>
                    ) : null}

                    {reportLocked ? (
                      <div className="space-y-2 border border-ink/20 bg-ink/[0.02] p-3">
                        {reopenPending ? (
                          <>
                            <p className="text-xs font-medium text-ink/80">
                              {fv.reportLockReopenPending}
                            </p>
                            {reopenJustification ? (
                              <p className="whitespace-pre-wrap text-xs text-ink/70">
                                <span className="font-medium">
                                  {fv.reportReopenJustification}:{" "}
                                </span>
                                {reopenJustification}
                              </p>
                            ) : null}
                            {canApproveReopen ? (
                              <button
                                type="button"
                                onClick={() => void approveReopen()}
                                disabled={lockBusy}
                                className="bzr-btn-primary bzr-btn-sm"
                              >
                                {lockBusy
                                  ? fv.reportReopenApproving
                                  : fv.reportReopenApprove}
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <label
                              htmlFor="reopen-justification"
                              className="block text-xs font-medium text-ink/80"
                            >
                              {fv.reportReopenJustification}
                            </label>
                            <textarea
                              id="reopen-justification"
                              value={reopenDraft}
                              onChange={(e) => setReopenDraft(e.target.value)}
                              rows={3}
                              disabled={lockBusy}
                              required
                              placeholder={
                                fv.reportReopenJustificationPlaceholder
                              }
                              className="w-full rounded-lg border border-border/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent disabled:bg-ink/[0.03]"
                            />
                            <button
                              type="button"
                              onClick={() => void requestReopen()}
                              disabled={lockBusy || !reopenDraft.trim()}
                              className="bzr-btn-primary bzr-btn-sm"
                            >
                              {lockBusy
                                ? fv.reportReopenSubmitting
                                : fv.reportReopenRequest}
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </div>

      {deleteConfirmOpen && onDelete ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="visit-delete-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-border/40 bg-surface p-5 shadow-lg">
            <h4
              id="visit-delete-confirm-title"
              className="text-sm font-semibold text-ink"
            >
              {fv.deleteTitle}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-ink/80">
              {fv.deleteConfirmWithClient.replace(
                "{client}",
                row.client_name?.trim() || m.common.noData,
              )}
            </p>
            {deleteError ? (
              <p className="mt-2 text-sm text-danger" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteConfirmOpen(false)}
                className="bzr-btn-ghost"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => void onDelete(row)}
                className="bzr-btn-danger"
              >
                {deleteLoading ? m.common.loading : m.common.delete}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeConfirmOpen ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="report-sign-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-border/40 bg-surface p-5 shadow-lg">
            <p
              id="report-sign-confirm-title"
              className="text-sm font-medium text-ink"
            >
              {fv.reportSignConfirmQuestion}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(false)}
                disabled={lockBusy}
                className="rounded-lg border border-border/40 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {fv.reportSignConfirmCancel}
              </button>
              <button
                type="button"
                onClick={() => void confirmCloseAndSign()}
                disabled={lockBusy}
                className="bzr-btn-primary bzr-btn-sm"
              >
                {lockBusy ? fv.reportClosing : fv.reportSignConfirmYes}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReportPrintView
        agencyName={agencyName ?? ""}
        brojNaloga={row.broj_naloga}
        clientName={row.client_name}
        visitDate={formatVisitDate(row.scheduled_at, locale)}
        reportFields={reportFields}
        legacyReport={report}
        signatures={signatures}
        assignees={assignees}
        labels={{
          title: fv.reportPrintTitle,
          agency: fv.reportPrintAgency,
          orderNumber: fv.detailBrojNaloga,
          client: fv.detailClient,
          visitDate: fv.detailScheduled,
          workers: fv.visitWorkersLabel,
          signatures: fv.reportSignatureTitle,
          noData: m.common.noData,
        }}
      />
    </div>,
    document.body,
  );
}
