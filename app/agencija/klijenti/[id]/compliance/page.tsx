import { redirect } from "next/navigation";
import { isUuid } from "@/lib/api/agency-scope";
import { notFound } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

/** Stari bookmark /agencija/klijenti/[id]/compliance → tab Rokovi. */
export default async function ClientComplianceRedirect({ params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`/agencija/klijenti/${id}?tab=rokovi`);
}
