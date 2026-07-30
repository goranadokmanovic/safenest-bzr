"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/locale-provider";

export type ReportTemplateRow = {
  id: string;
  name: string;
  template_content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type Props = {
  initialTemplates: ReportTemplateRow[];
};

const emptyForm = {
  name: "",
  template_content: "",
  is_default: false,
};

function sortTemplates(rows: ReportTemplateRow[]) {
  return [...rows].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function ReportTemplatesManager({ initialTemplates }: Props) {
  const { m } = useTranslations();
  const t = m.agencija.reportTemplates;
  const router = useRouter();

  const [templates, setTemplates] = useState(() =>
    sortTemplates(initialTemplates),
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/report-templates");
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        templates?: ReportTemplateRow[];
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setTemplates(sortTemplates(json.templates ?? []));
    } catch {
      setError(m.common.networkError);
    }
  }, [m.common.error, m.common.networkError]);

  // Ako SSR lista stigne prazna (npr. stara SELECT RLS), učitaj ponovo sa klijenta.
  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  // Ne prepisuj klijentsku listu praznim SSR rezultatom (npr. posle router.refresh).
  useEffect(() => {
    if (initialTemplates.length === 0) return;
    setTemplates(sortTemplates(initialTemplates));
  }, [initialTemplates]);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
  }, []);

  const startEdit = useCallback((row: ReportTemplateRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      template_content: row.template_content,
      is_default: row.is_default,
    });
    setError(null);
    setMessage(null);
    if (typeof window !== "undefined") {
      document
        .getElementById("template-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const url = editingId
        ? `/api/report-templates/${editingId}`
        : "/api/report-templates";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        template?: ReportTemplateRow;
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      if (json.template) {
        setTemplates((prev) => {
          const without = prev.filter((p) => p.id !== json.template!.id);
          const next = [...without, json.template!];
          if (json.template!.is_default) {
            return sortTemplates(
              next.map((p) =>
                p.id === json.template!.id
                  ? p
                  : { ...p, is_default: false },
              ),
            );
          }
          return sortTemplates(next);
        });
      } else {
        await refreshTemplates();
      }
      setMessage(editingId ? t.updated : t.created);
      resetForm();
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function setDefault(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setTemplates((prev) =>
        sortTemplates(prev.map((p) => ({ ...p, is_default: p.id === id }))),
      );
      setMessage(t.defaultSet);
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report-templates/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setTemplates((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) resetForm();
      setDeleteId(null);
      setMessage(t.deleted);
      router.refresh();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-ink/80" role="status">
          {message}
        </p>
      ) : null}

      <section aria-labelledby="templates-list-heading">
        <h2
          id="templates-list-heading"
          className="text-sm font-semibold text-ink"
        >
          {t.listTitle}
        </h2>

        {templates.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{t.empty}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {templates.map((row) => {
              const expanded = expandedIds.has(row.id);
              return (
                <li key={row.id} className="border border-ink/20 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {row.name}
                        {row.is_default ? (
                          <span className="ml-2 rounded bg-accent/40 px-1.5 py-0.5 text-xs font-medium">
                            {t.defaultBadge}
                          </span>
                        ) : null}
                      </p>
                      <p
                        className={`mt-2 whitespace-pre-wrap text-xs text-ink/70 ${
                          expanded ? "" : "line-clamp-4"
                        }`}
                      >
                        {row.template_content}
                      </p>
                      {row.template_content.length > 160 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(row.id)}
                          className="mt-1 text-xs font-medium text-ink underline underline-offset-2"
                        >
                          {expanded ? t.collapse : t.expand}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-border/40 px-2 py-1 text-xs"
                      >
                        {m.common.edit}
                      </button>
                      {!row.is_default ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void setDefault(row.id)}
                          className="rounded-lg border border-border/40 px-2 py-1 text-xs"
                        >
                          {t.setDefault}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteId(row.id)}
                        className="border border-red-800 px-2 py-1 text-xs text-red-800"
                      >
                        {m.common.delete}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form
        id="template-form"
        onSubmit={onSubmit}
        className="space-y-4 border border-ink/20 p-4"
      >
        <h2 className="text-sm font-semibold text-ink">
          {editingId ? t.editTitle : t.createTitle}
        </h2>
        <div>
          <label htmlFor="template-name" className="block text-sm font-medium">
            {t.nameLabel}
          </label>
          <input
            id="template-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="template-content"
            className="block text-sm font-medium"
          >
            {t.contentLabel}
          </label>
          <p className="mt-1 text-xs text-ink/60">{t.contentHint}</p>
          <textarea
            id="template-content"
            value={form.template_content}
            onChange={(e) =>
              setForm((f) => ({ ...f, template_content: e.target.value }))
            }
            required
            rows={10}
            className="mt-2 w-full rounded-lg border border-border/40 px-3 py-2 text-sm"
            placeholder={t.contentPlaceholder}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_default: e.target.checked }))
            }
          />
          {t.defaultLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="bzr-btn-primary"
          >
            {loading ? m.common.loading : editingId ? t.save : t.create}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-border/40 px-4 py-2 text-sm"
            >
              {m.common.cancel}
            </button>
          ) : null}
        </div>
      </form>

      {deleteId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border/40 bg-surface p-6">
            <h3 className="font-semibold">{t.deleteTitle}</h3>
            <p className="mt-2 text-sm text-ink/80">{t.deleteConfirm}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmDelete(deleteId)}
                className="border border-red-800 bg-red-50 px-4 py-1.5 text-sm font-semibold text-red-900 disabled:opacity-50"
              >
                {loading ? m.common.loading : m.common.confirm}
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(null)}
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
