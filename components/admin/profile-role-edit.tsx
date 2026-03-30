"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = [
  "super_admin",
  "agency_owner",
  "agency_collaborator",
  "field_worker",
  "client_user",
] as const;

type Props = {
  userId: string;
  role: string;
  /** Trenutno ulogovan super_admin — ne može sebi skinuti super_admin u UI */
  currentUserId: string;
};

export function ProfileRoleEdit({ userId, role: initialRole, currentUserId }: Props) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState(false);

  const isSelf = userId === currentUserId;

  async function save() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/profiles/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, acknowledge: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg(json.error ?? `Greška ${res.status}`);
        return;
      }
      setMsg("Sačuvano.");
      setAck(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        disabled={isSelf}
        className="max-w-[11rem] border border-ink/40 bg-white px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Uloga"
        title={
          isSelf
            ? "Sopstvenu ulogu menjaš u Supabase SQL — ovde je zaključano."
            : undefined
        }
      >
        {!(ROLES as readonly string[]).includes(initialRole) ? (
          <option value={initialRole}>{initialRole} (u bazi)</option>
        ) : null}
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {!isSelf ? (
        <>
          <label className="mt-2 flex max-w-[14rem] cursor-pointer items-start gap-2 text-[11px] text-ink/80">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>Potvrđujem promenu uloge.</span>
          </label>
          <button
            type="button"
            disabled={loading || role === initialRole || !ack}
            onClick={save}
            className="mt-1 max-w-[11rem] border border-ink bg-accent px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {loading ? "…" : "Primeni ulogu"}
          </button>
        </>
      ) : (
        <span className="text-[11px] text-ink/50">tvoj nalog</span>
      )}
      {msg ? (
        <p
          className={
            msg === "Sačuvano." ? "text-xs text-green-800" : "text-xs text-red-700"
          }
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
