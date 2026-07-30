"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPhraseModal } from "@/components/admin/admin-phrase-modal";
import { useTranslations } from "@/components/i18n/locale-provider";

type Props = {
  userId: string;
  email: string;
  disabled?: boolean;
};

export function UserDeleteButton({ userId, email, disabled }: Props) {
  const router = useRouter();
  const { m } = useTranslations();
  const [open, setOpen] = useState(false);

  const expected = `DELETE_USER|${userId}`;

  if (disabled) {
    return (
      <span
        className="text-[11px] text-ink/40"
        title={m.admin.users.ownAccountTitle}
      >
        {m.common.noData}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-red-800 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
      >
        {m.admin.users.deleteAccount}
      </button>
      <AdminPhraseModal
        open={open}
        onClose={() => setOpen(false)}
        title={m.admin.users.deleteTitle}
        description={m.admin.users.deleteDescription.replace("{email}", email)}
        expectedPhrase={expected}
        submitLabel={m.admin.users.deleteSubmit}
        danger
        onConfirm={async (phrase) => {
          const res = await fetch(`/api/admin/profiles/${userId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmPhrase: phrase }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) {
            throw new Error(json.error ?? `HTTP ${res.status}`);
          }
          router.refresh();
        }}
      />
    </>
  );
}
