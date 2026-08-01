import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { AssistantChat } from "@/components/agencija/asistent/AssistantChat";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function AgencijaAsistentPage() {
  await assertAgencyStaffUser();
  const locale = await getUserLocale();
  const m = getMessages(locale);
  const a = m.dashboard.assistant;

  return (
    <main className="relative isolate min-h-[calc(100vh-8rem)] w-full">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <div className="relative z-10 max-w-3xl">
        <BackButton href="/agencija" className="mb-3" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          {a.title}
        </h1>
        <p className="mt-1 text-sm text-ink/75">{a.intro}</p>
        <AssistantChat />
      </div>
    </main>
  );
}
