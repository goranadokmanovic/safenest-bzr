import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { FieldVisitSearch } from "@/components/field-visits/FieldVisitSearch";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function AgencijaPretragaPage() {
  await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const s = m.dashboard.search;

  return (
    <main className="relative isolate min-h-[calc(100vh-8rem)] w-full">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative z-10 max-w-3xl">
        <BackButton href="/agencija" className="mb-3" />
        <h1 className="text-2xl font-bold text-ink">{s.title}</h1>
        <p className="mt-2 text-sm text-ink/75">{s.intro}</p>
        <div>
          <FieldVisitSearch />
        </div>
      </div>
    </main>
  );
}
