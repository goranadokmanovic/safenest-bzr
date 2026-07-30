"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

export type AgencyOption = { id: string; name: string };

type Props = {
  userId: string;
  agencyId: string | null;
  agencies: AgencyOption[];
};

export function ProfileAgencyAssign({ userId, agencyId, agencies }: Props) {
  const router = useRouter();
  const { m } = useTranslations();
  const [value, setValue] = useState(agencyId ?? "");
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const changed = (agencyId ?? "") !== (value === "" ? "" : value);

  async function save() {
    setMsg(null);
    setLoading(true);
    try {
      const agency_id = value === "" ? null : value;
      const res = await fetch(`/api/admin/profiles/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id,
          acknowledge: true,
        }),
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
    <div className="mt-2 flex min-w-[10rem] flex-col gap-2 border-t border-ink/10 pt-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full max-w-[14rem] rounded-lg border border-border/40 bg-surface px-2 py-1 text-xs text-ink"
        aria-label={m.admin.users.assignAgencyLabel}
      >
        <option value="">{m.admin.users.noAgency}</option>
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-start gap-2 text-[11px] text-ink/80">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5"
        />
        <span>{m.admin.users.confirmAgencyChange}</span>
      </label>
      <button
        type="button"
        disabled={loading || !changed || !ack}
        onClick={save}
        className="max-w-[14rem] rounded-lg border border-border/40 bg-surface px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50"
      >
        {loading ? m.common.loading : m.admin.users.saveAgency}
      </button>
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
