"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { FieldVisitsModal } from "@/components/field-visits/FieldVisitsModal";
import type { FieldVisitDisplayRow } from "@/components/field-visits/FieldVisitsList";
import { VisitStatusBadge } from "@/components/field-visits/VisitStatusBadges";
import {
  formatVisitDate,
  normalizeVisitStatus,
} from "@/lib/field-visits/display";
import type { FieldVisitMetadata } from "@/lib/field-visits/types";

type SearchResult = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  notes: string | null;
  scheduled_at: string;
  status: string;
  metadata: FieldVisitMetadata | null;
  similarity: number;
};

type RiskFilter = "" | "low" | "medium" | "high";

function truncateNotes(text: string | null, maxLen: number): string {
  if (!text?.trim()) return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function similarityPercent(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
}

function similarityBadgeClass(percent: number): string {
  if (percent > 80) return "bzr-badge-success";
  if (percent >= 50) return "bzr-badge-warning";
  return "bzr-badge-neutral";
}

function toDisplayRow(result: SearchResult): FieldVisitDisplayRow {
  return {
    id: result.id,
    client_company_id: result.client_company_id,
    client_name: result.client_name,
    client_industry: null,
    scheduled_at: result.scheduled_at,
    started_at: null,
    completed_at: null,
    status: result.status,
    sync_status: "synced",
    notes: result.notes,
    metadata: result.metadata ?? {},
    assigned_user_id: null,
    assigned_user_name: null,
    audio_url: null,
    transcript: null,
    transcript_status: "pending",
    noise_mode: null,
    report_template_id: null,
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
    hitno_otklanjanje: false,
    parent_visit_id: null,
    parent_broj_naloga: null,
    photos: [],
    photo_count: 0,
    isLocal: false,
  };
}

export function FieldVisitSearch() {
  const { m, locale } = useTranslations();
  const s = m.dashboard.search;
  const fv = m.dashboard.fieldVisits;

  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [viewRow, setViewRow] = useState<FieldVisitDisplayRow | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    const hasQuery = q.length >= 2;
    const hasRisk = riskFilter !== "";

    if (!hasQuery && !hasRisk) {
      setError(s.queryTooShort);
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          // Eksplicitan filter iz dropdown-a ima prednost nad auto-detekcijom
          // nivoa rizika iz samog teksta upita (na backendu).
          ...(riskFilter ? { riskLevel: riskFilter } : {}),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        results?: SearchResult[];
        error?: string;
      };

      if (!res.ok) {
        setResults([]);
        setError(json.error ?? m.common.error);
        return;
      }

      setResults(json.results ?? []);
    } catch {
      setResults([]);
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [query, riskFilter, s.queryTooShort, m.common.error, m.common.networkError]);

  const canSubmit = query.trim().length >= 2 || riskFilter !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap gap-3">
        <label htmlFor="field-visit-search" className="sr-only">
          {s.inputLabel}
        </label>
        <input
          id="field-visit-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={s.inputPlaceholder}
          disabled={loading}
          className="relative z-[2] min-w-[min(100%,20rem)] flex-1 rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/50 disabled:opacity-60"
        />
        <label htmlFor="field-visit-search-risk" className="sr-only">
        {fv.form.riskLevel}
        </label>
        <select
          id="field-visit-search-risk"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
          disabled={loading}
          className="relative z-[2] rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60"
        >
          <option value="">{s.allRiskLevels}</option>
          <option value="low">{fv.riskLow}</option>
          <option value="medium">{fv.riskMedium}</option>
          <option value="high">{fv.riskHigh}</option>
        </select>
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="bzr-search-submit"
        >
          <span>{loading ? s.searching : s.searchButton}</span>
        </button>
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-ink/70" role="status">
          {s.loading}
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && searched && !error && results.length === 0 ? (
        <p className="mt-6 text-sm text-ink/70">{s.noResults}</p>
      ) : null}

      {!loading && results.length > 0 ? (
        <ul className="mt-8 space-y-4">
          {results.map((result) => {
            const percent = similarityPercent(result.similarity);
            const notesPreview = truncateNotes(result.notes, 200);
            const visitStatus = normalizeVisitStatus(result.status);

            return (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => setViewRow(toDisplayRow(result))}
                  className="w-full border border-ink/30 bg-surface p-4 text-left transition hover:border-ink hover:bg-ink/[0.02]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-semibold text-ink">
                        {result.client_name ?? m.common.noData}
                      </p>
                      <p className="text-xs text-ink/70">
                        {formatVisitDate(result.scheduled_at, locale)}
                      </p>
                      <div>
                        <VisitStatusBadge status={visitStatus} />
                      </div>
                      {notesPreview ? (
                        <p className="text-sm text-ink/80">{notesPreview}</p>
                      ) : (
                        <p className="text-sm text-ink/50 italic">
                          {s.noNotes}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${similarityBadgeClass(percent)}`}
                    >
                      {s.similarityBadge.replace("{percent}", String(percent))}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {viewRow ? (
        <FieldVisitsModal row={viewRow} onClose={() => setViewRow(null)} />
      ) : null}
    </>
  );
}