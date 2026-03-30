"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPhraseModal } from "@/components/admin/admin-phrase-modal";

type Props = {
  agencyId: string;
  agencyName: string;
};

export function AgencyDeleteButton({ agencyId, agencyName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const expected = `DELETE_AGENCY|${agencyId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full border border-red-800 text-red-800 px-2 py-1 text-xs font-semibold hover:bg-red-50"
      >
        Obriši agenciju
      </button>
      <AdminPhraseModal
        open={open}
        onClose={() => setOpen(false)}
        title="Brisanje agencije"
        description={`Trajno briše agenciju „${agencyName}”, klijente, dokumente, zaposlene, rokove i članstva. Korisnicima se skida veza (agency_id).`}
        expectedPhrase={expected}
        submitLabel="Obriši trajno"
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
