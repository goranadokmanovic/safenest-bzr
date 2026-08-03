import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";
import { SchedulingCalendar } from "@/components/agencija/SchedulingCalendar";

export const dynamic = "force-dynamic";

export default async function AgencijaZakazivanjePage() {
  await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const s = m.agencija.scheduling;

  return (
    <main className="bzr-scheduling-page relative isolate min-h-[calc(100vh-8rem)] space-y-8">
      <PageCornerDecor kind="halftone" variant="canvas" />

      <div className="bzr-page-header relative z-[1]">
        <div className="min-w-0">
          <p className="bzr-eyebrow">Terenski rad</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {s.title}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-ink/65">
            {s.intro}
          </p>
        </div>
      </div>

      <div className="relative z-[1]">
        <SchedulingCalendar />
      </div>
    </main>
  );
}
