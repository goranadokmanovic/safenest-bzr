"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { ROLE_KEYS } from "@/lib/i18n/types";

type Props = {
  userId: string;
  role: string;
  currentUserId: string;
};

export function ProfileRoleEdit({
  userId,
  role: initialRole,
  currentUserId,
}: Props) {
  const router = useRouter();
  const { m, roleLabel } = useTranslations();
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
        setMsg(json.error ?? `${m.common.error} ${res.status}`);
        return;
      }
      setMsg(m.common.saved);
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
        className="max-w-[14rem] rounded-lg border border-border/40 bg-surface px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={m.admin.users.roleLabel}
        title={isSelf ? m.admin.users.roleSelfLocked : undefined}
      >
        {!(ROLE_KEYS as readonly string[]).includes(initialRole) ? (
          <option value={initialRole}>
            {roleLabel(initialRole)}
          </option>
        ) : null}
        {ROLE_KEYS.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
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
            <span>{m.admin.users.confirmRoleChange}</span>
          </label>
          <button
            type="button"
            disabled={loading || role === initialRole || !ack}
            onClick={save}
            className="mt-1 max-w-[14rem] bzr-btn-primary bzr-btn-sm !px-2 !py-1"
          >
            {loading ? m.common.loading : m.admin.users.applyRole}
          </button>
        </>
      ) : (
        <span className="text-[11px] text-ink/50">
          {m.admin.users.yourAccount}
        </span>
      )}
      {msg ? (
        <p
          className={
            msg === m.common.saved
              ? "text-xs text-green-800"
              : "text-xs text-red-700"
          }
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
