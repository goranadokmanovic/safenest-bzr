"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPhraseModal } from "@/components/admin/admin-phrase-modal";
import { useTranslations } from "@/components/i18n/locale-provider";

type Props = {
  agencyId: string;
  agencyName: string;
};

export function AgencyDeleteButton({ agencyId, agencyName }: Props) {
  const router = useRouter();
  const { m } = useTranslations();
  const ag = m.admin.agencies;
  const [open, setOpen] = useState(false);

  const expected = `DELETE_AGENCY|${agencyId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full border border-red-800 text-red-800 px-2 py-1 text-xs font-semibold hover:bg-red-50"
      >
        {ag.deleteAgency}
      </button>
      <AdminPhraseModal
        open={open}
        onClose={() => setOpen(false)}
        title={ag.deleteAgencyTitle}
        description={ag.deleteAgencyDescription.replace("{name}", agencyName)}
        expectedPhrase={expected}
        submitLabel={ag.deleteAgencySubmit}
        danger
        onConfirm={async (phrase) => {
          const res = await fetch(`/api/admin/agencies/${agencyId}`, {
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
