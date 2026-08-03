"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRecords, deleteRecord } from "@/lib/offline/indexedDB";
import { getPhotosForLocalVisit } from "@/lib/offline/photos";
import { removeFromQueue } from "@/lib/offline/syncQueue";
import { useTranslations } from "@/components/i18n/locale-provider";
import { FieldVisitsModal } from "@/components/field-visits/FieldVisitsModal";
import { RiskBadge } from "@/components/field-visits/RiskBadge";
import { BrandDecor } from "@/components/brand/BrandDecor";
import {
  ReportLockBadge,
  ScheduledBadge,
  SyncStatusBadge,
  VisitStatusBadge,
} from "@/components/field-visits/VisitStatusBadges";
import { hasActiveReopenRequest } from "@/lib/api/report-lock";
import {
  formatDurationHours,
  formatVisitDate,
  mapLegacyOfflineVisitData,
  metaStr,
  normalizeRiskLevel,
  normalizeSyncStatus,
  normalizeVisitStatus,
} from "@/lib/field-visits/display";
import {
  fieldVisitReturnHref,
  isUpcomingFieldVisit,
  type AgencyWorkerOption,
  type FieldVisitListScope,
  type FieldVisitListTime,
} from "@/lib/field-visits/list";
import type {
  FieldVisitMetadata,
  FieldVisitPhotoDisplay,
} from "@/lib/field-visits/types";

const VISIT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isVisitId(value: string): boolean {
  return VISIT_ID_RE.test(value);
}

export type FieldVisitServerRow = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  client_industry: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  sync_status: string;
  notes: string | null;
  metadata: FieldVisitMetadata;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  audio_url: string | null;
  transcript: string | null;
  transcript_status: "pending" | "processing" | "done" | "failed";
  noise_mode: "quiet" | "noisy" | null;
  report_template_id: string | null;
  report: string | null;
  report_fields: Record<string, string> | null;
  report_status: "pending" | "processing" | "done" | "failed" | "skipped";
  report_lock_status: "in_progress" | "closed";
  report_closed_at: string | null;
  reopen_requested_at: string | null;
  reopen_justification: string | null;
  reopen_approved_at: string | null;
  signature_statement: string | null;
  report_content_hash: string | null;
  broj_naloga: string | null;
  hitno_otklanjanje: boolean;
  parent_visit_id: string | null;
  parent_broj_naloga: string | null;
  photos: FieldVisitPhotoDisplay[];
  photo_count: number;
};

export type FieldVisitDisplayRow = FieldVisitServerRow & {
  isLocal: boolean;
  localId?: string;
};

type FilterDraft = {
  clientName: string;
  industry: string;
  riskLevel: "" | "low" | "medium" | "high";
  dateFrom: string;
  dateTo: string;
  assignedUserId: string;
  reportLockStatus: "" | "in_progress" | "closed";
  brojNaloga: string;
  hitnoOtklanjanje: "" | "true" | "false";
};

const EMPTY_FILTERS: FilterDraft = {
  clientName: "",
  industry: "",
  riskLevel: "",
  dateFrom: "",
  dateTo: "",
  assignedUserId: "",
  reportLockStatus: "",
  brojNaloga: "",
  hitnoOtklanjanje: "",
};

async function deleteLocalVisit(localId: string): Promise<void> {
  await deleteRecord("field_visits", localId);
  await removeFromQueue(`field_visits:${localId}`);

  const photos = await getRecords<{ field_visit_local_id: string }>(
    "field_photos",
  );
  for (const p of photos) {
    if (p.data.field_visit_local_id === localId) {
      await deleteRecord("field_photos", p.id);
    }
  }

  const recordings = await getRecords<{ field_visit_local_id: string }>(
    "voice_recordings",
  );
  for (const recording of recordings) {
    if (recording.data.field_visit_local_id === localId) {
      await deleteRecord("voice_recordings", recording.id);
    }
  }
}

function buildListQuery(
  scope: FieldVisitListScope,
  time: FieldVisitListTime,
  filters: FilterDraft,
): string {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("time", time);
  if (scope === "all") {
    if (filters.clientName.trim()) {
      params.set("client_name", filters.clientName.trim());
    }
    if (filters.industry.trim()) {
      params.set("industry", filters.industry.trim());
    }
    if (filters.riskLevel) {
      params.set("risk_level", filters.riskLevel);
    }
    if (filters.dateFrom) {
      params.set("date_from", filters.dateFrom);
    }
    if (filters.dateTo) {
      params.set("date_to", filters.dateTo);
    }
    if (filters.assignedUserId) {
      params.set("assigned_user_id", filters.assignedUserId);
    }
    if (filters.reportLockStatus) {
      params.set("report_lock_status", filters.reportLockStatus);
    }
    if (filters.brojNaloga.trim()) {
      params.set("broj_naloga", filters.brojNaloga.trim());
    }
    if (filters.hitnoOtklanjanje === "true") {
      params.set("hitno_otklanjanje", "true");
    } else if (filters.hitnoOtklanjanje === "false") {
      params.set("hitno_otklanjanje", "false");
    }
  }
  return params.toString();
}

export function FieldVisitsList({
  serverRows: initialServerRows,
  clientNames,
  currentUserId,
  workers,
  deepLinkVisitId = null,
  deepLinkFrom = null,
}: {
  serverRows: FieldVisitServerRow[];
  clientNames: Record<string, string>;
  currentUserId: string;
  workers: AgencyWorkerOption[];
  /** SSR-resolved ?visit= — hides list until modal is ready. */
  deepLinkVisitId?: string | null;
  deepLinkFrom?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { m, locale } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const deepLinkHandled = useRef(false);

  const visitFromUrl = searchParams.get("visit");
  const resolvedDeepLinkId =
    deepLinkVisitId ??
    (visitFromUrl && isVisitId(visitFromUrl) ? visitFromUrl : null);
  const resolvedDeepLinkFrom =
    deepLinkFrom ?? searchParams.get("from") ?? null;
  const backHref = fieldVisitReturnHref(resolvedDeepLinkFrom);

  const [scope, setScope] = useState<FieldVisitListScope>("mine");
  const [time, setTime] = useState<FieldVisitListTime>("upcoming");
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterDraft>(EMPTY_FILTERS);
  const [serverRows, setServerRows] =
    useState<FieldVisitServerRow[]>(initialServerRows);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [localRows, setLocalRows] = useState<FieldVisitDisplayRow[]>([]);
  const [viewRow, setViewRow] = useState<FieldVisitDisplayRow | null>(null);
  const [highlightVisitId, setHighlightVisitId] = useState<string | null>(null);
  const [deepLinkPending, setDeepLinkPending] = useState(
    () => Boolean(resolvedDeepLinkId),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keep Terenske posete chrome hidden while opening from calendar. */
  const suppressListChrome =
    deepLinkPending || Boolean(viewRow && backHref);

  useEffect(() => {
    // After a calendar deep-link we own list state via fetchList — don't
    // clobber it with the page's default mine/upcoming SSR payload.
    if (deepLinkHandled.current) return;
    setServerRows(initialServerRows);
  }, [initialServerRows]);

  const fetchList = useCallback(
    async (
      nextScope: FieldVisitListScope,
      nextTime: FieldVisitListTime,
      filters: FilterDraft,
    ): Promise<FieldVisitServerRow[]> => {
      setListLoading(true);
      setListError(null);
      try {
        const qs = buildListQuery(nextScope, nextTime, filters);
        const res = await fetch(`/api/field-visits?${qs}`);
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          field_visits?: FieldVisitServerRow[];
        };
        if (!res.ok) {
          setListError(json.error ?? m.common.error);
          return [];
        }
        const rows = json.field_visits ?? [];
        setServerRows(rows);
        return rows;
      } catch {
        setListError(m.common.networkError);
        return [];
      } finally {
        setListLoading(false);
      }
    },
    [m.common.error, m.common.networkError],
  );

  const clearVisitQueryParam = useCallback(() => {
    if (!searchParams.get("visit")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("visit");
    const qs = next.toString();
    router.replace(qs ? `/agencija/field-visits?${qs}` : "/agencija/field-visits");
  }, [router, searchParams]);

  useEffect(() => {
    if (deepLinkHandled.current) return;
    const visitId = resolvedDeepLinkId;
    if (!visitId) {
      setDeepLinkPending(false);
      return;
    }
    deepLinkHandled.current = true;
    setDeepLinkPending(true);

    const nextScope: FieldVisitListScope =
      searchParams.get("scope") === "mine" ? "mine" : "all";
    const nextTime: FieldVisitListTime =
      searchParams.get("time") === "history" ? "history" : "upcoming";

    setScope(nextScope);
    setTime(nextTime);
    if (nextScope === "mine") {
      setFilterDraft(EMPTY_FILTERS);
      setAppliedFilters(EMPTY_FILTERS);
    }

    void (async () => {
      try {
        let rows = await fetchList(nextScope, nextTime, EMPTY_FILTERS);
        let found = rows.find((r) => r.id === visitId);
        if (!found) {
          const other: FieldVisitListTime =
            nextTime === "upcoming" ? "history" : "upcoming";
          setTime(other);
          rows = await fetchList(nextScope, other, EMPTY_FILTERS);
          found = rows.find((r) => r.id === visitId);
        }
        if (found) {
          setError(null);
          setViewRow({ ...found, isLocal: false });
          setHighlightVisitId(visitId);
        } else {
          setListError(m.common.error);
        }
      } finally {
        setDeepLinkPending(false);
      }
    })();
    // Only bootstrap from the initial URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link bootstrap
  }, [resolvedDeepLinkId, searchParams, fetchList]);

  /* Scroll to the row only after the modal closes — scrolling while the
     dialog is open fought the shell layout / wide table. */
  useEffect(() => {
    if (!highlightVisitId || viewRow) return;
    const el = document.querySelector<HTMLElement>(
      `[data-visit-id="${highlightVisitId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [highlightVisitId, serverRows, viewRow]);

  async function switchScope(next: FieldVisitListScope) {
    if (next === scope) return;
    setScope(next);
    if (next === "mine") {
      setFilterDraft(EMPTY_FILTERS);
      setAppliedFilters(EMPTY_FILTERS);
      await fetchList("mine", time, EMPTY_FILTERS);
    } else {
      await fetchList("all", time, appliedFilters);
    }
  }

  async function switchTime(next: FieldVisitListTime) {
    if (next === time) return;
    setTime(next);
    const filters = scope === "mine" ? EMPTY_FILTERS : appliedFilters;
    await fetchList(scope, next, filters);
  }

  async function applyFilters() {
    setAppliedFilters(filterDraft);
    await fetchList("all", time, filterDraft);
  }

  async function resetFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    await fetchList("all", time, EMPTY_FILTERS);
  }

  const loadLocal = useCallback(async () => {
    try {
      const records = await getRecords<Record<string, unknown>>("field_visits");
      const unsynced = records.filter((r) => !r.synced);
      const counts: Record<string, number> = {};
      for (const r of unsynced) {
        const photos = await getPhotosForLocalVisit(r.id);
        counts[r.id] = photos.length;
      }
      setLocalRows(
        unsynced.map((r) => {
          const mapped = mapLegacyOfflineVisitData(r.data);
          return {
            id: r.id,
            localId: r.id,
            isLocal: true,
            client_company_id: mapped.client_company_id,
            client_name:
              clientNames[mapped.client_company_id] ??
              mapped.client_company_id.slice(0, 8),
            client_industry: null,
            scheduled_at: mapped.scheduled_at,
            started_at: null,
            completed_at: null,
            status: mapped.status,
            sync_status: "pending",
            notes: mapped.notes,
            metadata: mapped.metadata,
            assigned_user_id: mapped.assigned_user_id ?? currentUserId,
            assigned_user_name: null,
            audio_url: null,
            transcript: null,
            transcript_status: "pending",
            noise_mode: null,
            report_template_id:
              typeof r.data.report_template_id === "string"
                ? r.data.report_template_id
                : null,
            report: null,
            report_fields: null,
            report_status: "pending",
            report_lock_status: "in_progress",
            report_closed_at: null,
            reopen_requested_at: null,
            reopen_justification: null,
            reopen_approved_at: null,
            signature_statement: null,
            report_content_hash: null,
            broj_naloga: null,
            hitno_otklanjanje: mapped.hitno_otklanjanje === true,
            parent_visit_id:
              typeof r.data.parent_visit_id === "string"
                ? r.data.parent_visit_id
                : null,
            parent_broj_naloga: null,
            photos: [],
            photo_count: counts[r.id] ?? 0,
          };
        }),
      );
    } catch {
      setLocalRows([]);
    }
  }, [clientNames, currentUserId]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal, serverRows]);

  const rows = useMemo(() => {
    const nowMs = Date.now();
    const localForScope =
      scope === "mine"
        ? localRows.filter(
            (r) =>
              !r.assigned_user_id || r.assigned_user_id === currentUserId,
          )
        : localRows;

    const localForTime = localForScope.filter((r) => {
      const upcoming = isUpcomingFieldVisit(r.scheduled_at, r.status, nowMs);
      return time === "upcoming" ? upcoming : !upcoming;
    });

    const server: FieldVisitDisplayRow[] = serverRows.map((r) => ({
      ...r,
      isLocal: false,
    }));
    const merged = [...localForTime, ...server];
    merged.sort((a, b) => {
      const diff =
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
      return time === "upcoming" ? diff : -diff;
    });
    return merged;
  }, [serverRows, localRows, scope, time, currentUserId]);

  async function confirmDelete(row: FieldVisitDisplayRow) {
    setLoading(true);
    setError(null);
    try {
      if (row.isLocal && row.localId) {
        await deleteLocalVisit(row.localId);
        await loadLocal();
      } else {
        const res = await fetch(`/api/field-visits/${row.id}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? m.common.error);
          return;
        }
        await fetchList(scope, time, appliedFilters);
        router.refresh();
      }
      setViewRow(null);
      setHighlightVisitId(null);
      clearVisitQueryParam();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "bzr-input mt-1.5";

  return (
    <>
      {deepLinkPending ? (
        <p className="py-16 text-center text-sm text-ink/55" role="status">
          {fv.deepLinkLoading}
        </p>
      ) : null}

      {!suppressListChrome ? (
      <>
      <div className="mt-7 flex flex-col gap-3">
        <div
          className="bzr-tabs bzr-tabs-premium"
          role="tablist"
          aria-label={fv.tabsAriaLabel}
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === "mine"}
            onClick={() => void switchScope("mine")}
            className="bzr-tab bzr-tab-premium"
          >
            {fv.tabMine}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            onClick={() => void switchScope("all")}
            className="bzr-tab bzr-tab-premium"
          >
            {fv.tabAll}
          </button>
        </div>
        <div
          className="bzr-tabs bzr-tabs-premium"
          role="tablist"
          aria-label={fv.tabsTimeAriaLabel}
        >
          <button
            type="button"
            role="tab"
            aria-selected={time === "upcoming"}
            onClick={() => void switchTime("upcoming")}
            className="bzr-tab bzr-tab-premium"
          >
            {fv.tabUpcoming}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={time === "history"}
            onClick={() => void switchTime("history")}
            className="bzr-tab bzr-tab-premium"
          >
            {fv.tabHistory}
          </button>
        </div>
      </div>

      {scope === "all" ? (
        <form
          className="bzr-panel mt-4 grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void applyFilters();
          }}
        >
          <div>
            <label htmlFor="fv-filter-client" className="block text-xs font-medium">
              {fv.filterClientName}
            </label>
            <input
              id="fv-filter-client"
              type="search"
              value={filterDraft.clientName}
              onChange={(e) =>
                setFilterDraft((f) => ({ ...f, clientName: e.target.value }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="fv-filter-industry"
              className="block text-xs font-medium"
            >
              {fv.filterIndustry}
            </label>
            <input
              id="fv-filter-industry"
              type="search"
              value={filterDraft.industry}
              onChange={(e) =>
                setFilterDraft((f) => ({ ...f, industry: e.target.value }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="fv-filter-risk" className="block text-xs font-medium">
              {fv.filterRisk}
            </label>
            <select
              id="fv-filter-risk"
              value={filterDraft.riskLevel}
              onChange={(e) =>
                setFilterDraft((f) => ({
                  ...f,
                  riskLevel: e.target.value as FilterDraft["riskLevel"],
                }))
              }
              className={inputClass}
            >
              <option value="">{fv.filterAny}</option>
              <option value="low">{fv.riskLow}</option>
              <option value="medium">{fv.riskMedium}</option>
              <option value="high">{fv.riskHigh}</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="fv-filter-date-from"
              className="block text-xs font-medium"
            >
              {fv.filterDateFrom}
            </label>
            <input
              id="fv-filter-date-from"
              type="date"
              value={filterDraft.dateFrom}
              onChange={(e) =>
                setFilterDraft((f) => ({ ...f, dateFrom: e.target.value }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="fv-filter-date-to"
              className="block text-xs font-medium"
            >
              {fv.filterDateTo}
            </label>
            <input
              id="fv-filter-date-to"
              type="date"
              value={filterDraft.dateTo}
              onChange={(e) =>
                setFilterDraft((f) => ({ ...f, dateTo: e.target.value }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="fv-filter-worker"
              className="block text-xs font-medium"
            >
              {fv.filterWorker}
            </label>
            <select
              id="fv-filter-worker"
              value={filterDraft.assignedUserId}
              onChange={(e) =>
                setFilterDraft((f) => ({
                  ...f,
                  assignedUserId: e.target.value,
                }))
              }
              className={inputClass}
            >
              <option value="">{fv.filterAny}</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="fv-filter-lock"
              className="block text-xs font-medium"
            >
              {fv.filterReportLock}
            </label>
            <select
              id="fv-filter-lock"
              value={filterDraft.reportLockStatus}
              onChange={(e) =>
                setFilterDraft((f) => ({
                  ...f,
                  reportLockStatus: e.target
                    .value as FilterDraft["reportLockStatus"],
                }))
              }
              className={inputClass}
            >
              <option value="">{fv.filterAny}</option>
              <option value="in_progress">{fv.reportLockInProgress}</option>
              <option value="closed">{fv.reportLockClosed}</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="fv-filter-broj"
              className="block text-xs font-medium"
            >
              {fv.filterBrojNaloga}
            </label>
            <input
              id="fv-filter-broj"
              type="search"
              placeholder="12/26"
              value={filterDraft.brojNaloga}
              onChange={(e) =>
                setFilterDraft((f) => ({ ...f, brojNaloga: e.target.value }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="fv-filter-hitno"
              className="block text-xs font-medium"
            >
              {fv.filterHitnoOtklanjanje}
            </label>
            <select
              id="fv-filter-hitno"
              value={filterDraft.hitnoOtklanjanje}
              onChange={(e) =>
                setFilterDraft((f) => ({
                  ...f,
                  hitnoOtklanjanje: e.target
                    .value as FilterDraft["hitnoOtklanjanje"],
                }))
              }
              className={inputClass}
            >
              <option value="">{fv.filterAny}</option>
              <option value="true">{fv.filterHitnoYes}</option>
              <option value="false">{fv.filterHitnoNo}</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={listLoading}
              className="bzr-btn-primary bzr-btn-sm"
            >
              {listLoading ? m.common.loading : fv.filterApply}
            </button>
            <button
              type="button"
              disabled={listLoading}
              onClick={() => void resetFilters()}
              className="bzr-btn-ghost bzr-btn-sm"
            >
              {fv.filterReset}
            </button>
          </div>
        </form>
      ) : null}

      {listError ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {listError}
        </p>
      ) : null}

      {error && !viewRow ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {listLoading && rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink/70">{m.common.loading}</p>
      ) : null}

      {!listLoading && rows.length === 0 ? (
        <div className="bzr-empty">
          <BrandDecor
            kind="megaphone"
            layer="inline"
            sizeClassName="h-44 w-44"
            className="mb-4 !opacity-85"
          />
          <p className="relative text-lg font-semibold text-ink">
            {scope === "mine"
              ? time === "upcoming"
                ? fv.noVisitsMineUpcoming
                : fv.noVisitsMine
              : fv.noVisitsFiltered}
          </p>
          <p className="relative mt-2 max-w-sm text-base text-ink/55">
            Kreiraj novu terensku posetu ili promeni filtere.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div
          className={`bzr-table-wrap bzr-field-visits-table ${listLoading ? "opacity-60" : ""}`}
        >
          <table>
            <thead>
              <tr>
                <th className="w-[10%]">{fv.colBrojNaloga}</th>
                <th className={scope === "all" ? "w-[14%]" : "w-[18%]"}>
                  {fv.colClient}
                </th>
                {scope === "all" ? (
                  <th className="w-[11%]">{fv.colWorker}</th>
                ) : null}
                <th className="w-[7%]">{fv.colHitnoOtklanjanje}</th>
                <th className="w-[12%]">{fv.colScheduled}</th>
                <th className="w-[7%]">{fv.colDuration}</th>
                <th className="w-[9%]">{fv.colRisk}</th>
                <th className="w-[9%]">{fv.colVisitStatus}</th>
                <th className="w-[10%]">{fv.colSync}</th>
                <th className="w-[10%]">{fv.colReportLock}</th>
                <th className="w-[6%]">{fv.colPhotos}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = row.metadata ?? {};
                const syncStatus = normalizeSyncStatus(
                  row.sync_status,
                  row.isLocal,
                );
                const visitStatus = normalizeVisitStatus(row.status);
                const risk = normalizeRiskLevel(metaStr(meta, "risk_level"));
                const openLabel = `${fv.detailsTitle}: ${row.client_name ?? row.broj_naloga ?? row.id}`;

                const highlighted =
                  !row.isLocal && highlightVisitId === row.id;

                return (
                  <tr
                    key={row.isLocal ? `local-${row.id}` : row.id}
                    data-visit-id={row.isLocal ? undefined : row.id}
                    className={`bzr-visit-row cursor-pointer${
                      highlighted ? " bzr-visit-row--deep-link" : ""
                    }`}
                    tabIndex={0}
                    aria-label={openLabel}
                    onClick={() => {
                      setError(null);
                      setViewRow(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setError(null);
                        setViewRow(row);
                      }
                    }}
                  >
                    <td className="font-medium tabular-nums">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {row.broj_naloga ?? m.common.noData}
                        {row.parent_visit_id ? (
                          <span
                            className="bzr-badge-neutral !rounded !px-1 !py-0 text-[10px] uppercase tracking-wide"
                            title={
                              row.parent_broj_naloga
                                ? fv.controlBadgeTitle.replace(
                                    "{broj}",
                                    row.parent_broj_naloga,
                                  )
                                : fv.controlBadge
                            }
                          >
                            {fv.controlBadge}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <span
                        className="block font-medium leading-snug"
                        title={row.client_name ?? undefined}
                      >
                        {row.client_name ?? m.common.noData}
                      </span>
                    </td>
                    {scope === "all" ? (
                      <td className="text-xs text-ink/70">
                        {row.assigned_user_name ?? m.common.noData}
                      </td>
                    ) : null}
                    <td className="text-xs">
                      {row.hitno_otklanjanje ? (
                        <span className="font-semibold text-danger">
                          {fv.filterHitnoYes}
                        </span>
                      ) : (
                        <span className="text-ink/55">{fv.filterHitnoNo}</span>
                      )}
                    </td>
                    <td className="text-xs leading-snug text-ink/75">
                      <span className="inline-flex flex-col items-start gap-1">
                        {formatVisitDate(row.scheduled_at, locale)}
                        {isUpcomingFieldVisit(row.scheduled_at, row.status) ? (
                          <ScheduledBadge />
                        ) : null}
                      </span>
                    </td>
                    <td className="tabular-nums text-ink/80">
                      {formatDurationHours(meta, fv.hoursSuffix, {
                        started_at: row.started_at,
                        completed_at: row.completed_at,
                      }) ??
                        (visitStatus === "in_progress"
                          ? fv.durationInProgress
                          : m.common.noData)}
                    </td>
                    <td>
                      {risk ? (
                        <RiskBadge level={risk} />
                      ) : (
                        m.common.noData
                      )}
                    </td>
                    <td>
                      <VisitStatusBadge status={visitStatus} />
                    </td>
                    <td>
                      <SyncStatusBadge status={syncStatus} />
                    </td>
                    <td>
                      <ReportLockBadge
                        status={
                          row.report_lock_status === "closed"
                            ? "closed"
                            : "in_progress"
                        }
                        reopenPending={hasActiveReopenRequest(row)}
                      />
                    </td>
                    <td className="tabular-nums text-ink/70">
                      {row.photo_count > 0 ? row.photo_count : m.common.noData}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      </>
      ) : null}

      {viewRow ? (
        <FieldVisitsModal
          row={viewRow}
          backHref={backHref}
          onClose={() => {
            setViewRow(null);
            setError(null);
            setHighlightVisitId(null);
            clearVisitQueryParam();
          }}
          onOpenParentVisit={(parentId) => {
            const parent = rows.find((r) => !r.isLocal && r.id === parentId);
            if (parent) setViewRow(parent);
          }}
          onDelete={confirmDelete}
          deleteLoading={loading}
          deleteError={error}
          workers={workers}
          currentUserId={currentUserId}
          canManageTeam={!viewRow.isLocal}
        />
      ) : null}
    </>
  );
}
