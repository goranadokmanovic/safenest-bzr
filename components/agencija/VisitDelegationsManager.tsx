"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

type Worker = { user_id: string; full_name: string; email: string };

type Delegation = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_user_name: string;
  to_user_name: string;
  active: boolean;
  note: string | null;
  created_at: string;
  revoked_at: string | null;
};

export function VisitDelegationsManager() {
  const { m } = useTranslations();
  const t = m.agencija.delegations;

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [rows, setRows] = useState<Delegation[]>([]);
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setWorkersLoading(true);
    try {
      const res = await fetch("/api/agency/delegations");
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        delegations?: Delegation[];
        collaborators?: Worker[];
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setRows(json.delegations ?? []);
      setWorkers(json.collaborators ?? []);
    } catch {
      setError(m.common.networkError);
    } finally {
      setWorkersLoading(false);
    }
  }, [m.common.error, m.common.networkError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (fromUserId && fromUserId === toUserId) {
      setError(t.sameWorkerError);
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/agency/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_user_id: fromUserId,
          to_user_id: toUserId,
          note: note.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setInfo(t.created);
      setFromUserId("");
      setToUserId("");
      setNote("");
      await load();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function onRevoke(id: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/agency/delegations/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setInfo(t.revoked);
      await load();
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  const active = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);

  const fromOptions = workers.filter((w) => w.user_id !== toUserId);
  const toOptions = workers.filter((w) => w.user_id !== fromUserId);

  return (
    <div className="mt-8 space-y-8">
      <form
        onSubmit={onCreate}
        className="space-y-4 border border-ink/20 p-4"
      >
        <h2 className="text-lg font-semibold">{t.grantTitle}</h2>
        <p className="text-sm text-ink/70">{t.grantHint}</p>
        {workersLoading ? (
          <p className="text-sm text-ink/70">{m.common.loading}</p>
        ) : null}
        {!workersLoading && workers.length === 0 ? (
          <p className="text-sm text-ink/70" role="status">
            {t.emptyWorkers}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="del-from" className="block text-sm font-medium">
              {t.fromWorker}
            </label>
            <select
              id="del-from"
              required
              value={fromUserId}
              onChange={(e) => {
                const next = e.target.value;
                setFromUserId(next);
                if (next && next === toUserId) setToUserId("");
              }}
              className="mt-1 w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm"
            >
              <option value="">
                {workersLoading ? m.common.loading : t.selectWorker}
              </option>
              {fromOptions.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="del-to" className="block text-sm font-medium">
              {t.toWorker}
            </label>
            <select
              id="del-to"
              required
              value={toUserId}
              onChange={(e) => {
                const next = e.target.value;
                setToUserId(next);
                if (next && next === fromUserId) setFromUserId("");
              }}
              className="mt-1 w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm"
            >
              <option value="">
                {workersLoading ? m.common.loading : t.selectWorker}
              </option>
              {toOptions.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="del-note" className="block text-sm font-medium">
            {t.note}
          </label>
          <input
            id="del-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
            className="mt-1 w-full max-w-lg rounded-lg border border-border/40 px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-ink/80" role="status">
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || !fromUserId || !toUserId}
          className="bzr-btn-primary"
        >
          {loading ? m.common.loading : t.grant}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold">{t.activeTitle}</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">{t.emptyActive}</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/15 border border-ink/20">
            {active.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {d.from_user_name} → {d.to_user_name}
                  </p>
                  {d.note ? (
                    <p className="text-xs text-ink/60">{d.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void onRevoke(d.id)}
                  className="border border-red-800 px-3 py-1 text-xs text-red-800 disabled:opacity-60"
                >
                  {t.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-ink/70">
            {t.revokedTitle}
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-ink/60">
            {inactive.map((d) => (
              <li key={d.id}>
                {d.from_user_name} → {d.to_user_name}
                {d.note ? ` (${d.note})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
