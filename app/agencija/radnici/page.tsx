import { redirect } from "next/navigation";
import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { BackButton } from "@/components/ui/BackButton";
import { AgencyTeamManager } from "@/components/agencija/AgencyTeamManager";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function AgencijaRadniciPage() {
  const { role, user } = await assertAgencyStaffUser();
  if (role !== "agency_owner") {
    redirect("/agencija");
  }

  const locale = await getUserLocale();
  const m = getMessages(locale);
  const t = m.agencija.team;

  return (
    <main className="bzr-team-page relative isolate min-h-[calc(100vh-8rem)]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <BackButton href="/agencija" className="relative mb-3" />
      <h1 className="relative text-2xl font-bold text-ink">{t.title}</h1>
      <p className="relative mt-1 max-w-2xl text-sm text-ink/70">{t.intro}</p>
      <div className="relative z-10">
        <AgencyTeamManager currentUserId={user.id} />
      </div>
    </main>
  );
}
