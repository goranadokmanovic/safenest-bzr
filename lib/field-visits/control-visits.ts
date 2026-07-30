import type { SupabaseClient } from "@supabase/supabase-js";

/** Aktivni from_user_id čije naloge trenutni korisnik sme da nastavlja. */
export async function getDelegatedFromUserIds(
  supabase: SupabaseClient,
  agencyId: string,
  toUserId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("visit_delegations")
    .select("from_user_id")
    .eq("agency_id", agencyId)
    .eq("to_user_id", toUserId)
    .eq("active", true);

  return [...new Set((data ?? []).map((d) => d.from_user_id as string))];
}

/**
 * Predviđeni broj naloga za kontrolnu posetu (best-effort; stvarni dodeljuje trigger).
 * parentId može biti koren ili već-kontrolna — uvek se računa preko korena.
 */
export async function previewControlBrojNaloga(
  supabase: SupabaseClient,
  agencyId: string,
  parentId: string,
): Promise<{
  root_id: string;
  root_broj_naloga: string;
  predicted_broj_naloga: string;
} | null> {
  let rootId = parentId;
  let rootBroj: string | null = null;

  for (let i = 0; i < 50; i++) {
    const { data } = await supabase
      .from("field_visits")
      .select("id, parent_visit_id, broj_naloga, agency_id")
      .eq("id", rootId)
      .maybeSingle();

    if (!data || data.agency_id !== agencyId) return null;

    if (!data.parent_visit_id) {
      rootBroj = data.broj_naloga;
      break;
    }
    rootId = data.parent_visit_id;
  }

  if (!rootBroj || !rootBroj.includes("/")) return null;

  const { count } = await supabase
    .from("field_visits")
    .select("id", { count: "exact", head: true })
    .eq("parent_visit_id", rootId);

  const base = rootBroj.split("/")[0].split("-")[0];
  const year = rootBroj.split("/")[1];
  const next = (count ?? 0) + 1;

  return {
    root_id: rootId,
    root_broj_naloga: rootBroj,
    predicted_broj_naloga: `${base}-${next}/${year}`,
  };
}
