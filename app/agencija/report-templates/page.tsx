import { redirect } from "next/navigation";
import { assertAgencyStaffUser } from "@/lib/agency/gate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n";
import { BackButton } from "@/components/ui/BackButton";
import {
  ReportTemplatesManager,
  type ReportTemplateRow,
} from "@/components/agencija/ReportTemplatesManager";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export const dynamic = "force-dynamic";

export default async function AgencijaReportTemplatesPage() {
  const { agency_id, role } = await assertAgencyStaffUser();
  if (role !== "agency_owner") {
    redirect("/agencija");
  }

  const locale = await getUserLocale();
  const m = getMessages(locale);
  const t = m.agencija.reportTemplates;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("report_templates")
    .select("id, name, template_content, is_default, created_at, updated_at")
    .eq("agency_id", agency_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const templates = (data ?? []) as ReportTemplateRow[];

  return (
    <main className="relative isolate min-h-[32rem]">
      <PageCornerDecor kind="halftone" variant="canvas" />
      <BackButton href="/agencija" className="relative mb-3" />
      <h1 className="relative text-2xl font-bold text-ink">{t.title}</h1>
      <p className="relative mt-1 max-w-2xl text-sm text-ink/70">{t.intro}</p>

      <div className="relative">
        {error ? (
          <p className="mt-6 text-sm text-red-700" role="alert">
            {error.message}
          </p>
        ) : (
          <ReportTemplatesManager initialTemplates={templates} />
        )}
      </div>
    </main>
  );
}
