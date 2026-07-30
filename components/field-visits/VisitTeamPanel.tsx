"use client";

import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import type { VisitAssignee } from "@/lib/api/report-signature";

export type WorkerOption = {
  user_id: string;
  full_name: string;
  email: string;
};

type Props = {
  visitId: string;
  assignees: VisitAssignee[];
  workers: WorkerOption[];
  canManage: boolean;
  disabled?: boolean;
  onChange: (assignees: VisitAssignee[]) => void;
};

export function VisitTeamPanel({
  visitId,
  assignees,
  workers,
  canManage,
  disabled = false,
  onChange,
}: Props) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collaboratorIds = new Set(
    assignees.filter((a) => a.role === "collaborator").map((a) => a.user_id),
  );
  const primaryId = assignees.find((a) => a.role === "primary")?.user_id;
  const available = workers.filter(
    (w) => w.user_id !== primaryId && !collaboratorIds.has(w.user_id),
  );

  async function addCollaborator() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/field-visits/${visitId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selected }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignees?: VisitAssignee[];
      };
      if (!res.ok) {
        setError(body.error ?? m.common.error);
        return;
      }
      onChange(body.assignees ?? []);
      setSelected("");
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function removeCollaborator(userId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/field-visits/${visitId}/collaborators?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        assignees?: VisitAssignee[];
      };
      if (!res.ok) {
        setError(body.error ?? m.common.error);
        return;
      }
      onChange(body.assignees ?? []);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-ink/10 py-2">
      <p className="text-xs font-medium text-ink/70">{fv.visitWorkersLabel}</p>
      <p className="mt-1 text-sm text-ink">
        {assignees.length > 0
          ? assignees.map((a) => a.full_name).join(", ")
          : fv.visitWorkersEmpty}
      </p>

      {canManage && !disabled ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy || available.length === 0}
              className="min-w-[12rem] flex-1 rounded-lg border border-border/40 bg-surface px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">{fv.visitWorkersSelect}</option>
              {available.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name || w.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addCollaborator()}
              disabled={busy || !selected}
              className="rounded-lg border border-border/40 px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {fv.visitWorkersAdd}
            </button>
          </div>
          {assignees
            .filter((a) => a.role === "collaborator")
            .map((a) => (
              <div
                key={a.user_id}
                className="flex items-center justify-between text-xs text-ink/80"
              >
                <span>{a.full_name}</span>
                <button
                  type="button"
                  onClick={() => void removeCollaborator(a.user_id)}
                  disabled={busy}
                  className="underline disabled:opacity-50"
                >
                  {fv.visitWorkersRemove}
                </button>
              </div>
            ))}
          {error ? (
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
