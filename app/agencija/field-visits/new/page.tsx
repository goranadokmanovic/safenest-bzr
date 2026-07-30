import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { FieldVisitForm } from "@/components/field-visits/FieldVisitForm";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function NovaTerenskaPosetaPage() {
  await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const fv = m.dashboard.fieldVisits;

  return (
    <main className="relative isolate min-h-[32rem] max-w-2xl">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-ink pb-6">
        <div>
          <BackButton href="/agencija/field-visits" className="mb-3" />
          <h1 className="text-2xl font-bold text-ink">{fv.newVisit}</h1>
        </div>
      </div>

      <div className="relative">
        <FieldVisitForm />
      </div>
    </main>
  );
}
