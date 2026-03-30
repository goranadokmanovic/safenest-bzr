import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Briše agenciju i povezane redove (redosled prilagođen šemi SafeNest BZR).
 * Ako neka tabela/kolona ne postoji, vratiće se greška iz Supabase-a.
 */
export async function deleteAgencyCascade(
  admin: SupabaseClient,
  agencyId: string,
): Promise<{ error: Error | null }> {
  const { data: clients, error: cErr } = await admin
    .from("client_companies")
    .select("id")
    .eq("agency_id", agencyId);

  if (cErr) {
    return { error: new Error(cErr.message) };
  }

  const { data: agencyUsers, error: uErr } = await admin
    .from("profiles")
    .select("user_id")
    .eq("agency_id", agencyId);

  if (uErr) {
    return { error: new Error(uErr.message) };
  }

  const userIds = (agencyUsers ?? [])
    .map((r) => r.user_id as string)
    .filter(Boolean);

  if (userIds.length > 0) {
    const { error: nErr } = await admin
      .from("notifications")
      .delete()
      .in("user_id", userIds);
    if (nErr) return { error: new Error(nErr.message) };
  }

  const clientIds = (clients ?? []).map((r) => r.id as string).filter(Boolean);

  if (clientIds.length > 0) {
    const { error: d1 } = await admin
      .from("documents")
      .delete()
      .in("client_company_id", clientIds);
    if (d1) return { error: new Error(d1.message) };

    const { error: d2 } = await admin
      .from("employees")
      .delete()
      .in("client_company_id", clientIds);
    if (d2) return { error: new Error(d2.message) };
  }

  const { error: dClients } = await admin
    .from("client_companies")
    .delete()
    .eq("agency_id", agencyId);
  if (dClients) return { error: new Error(dClients.message) };

  const { error: dDead } = await admin
    .from("deadlines")
    .delete()
    .eq("agency_id", agencyId);
  if (dDead) return { error: new Error(dDead.message) };

  const { error: dMem } = await admin
    .from("agency_members")
    .delete()
    .eq("agency_id", agencyId);
  if (dMem) return { error: new Error(dMem.message) };

  const { error: upProf } = await admin
    .from("profiles")
    .update({ agency_id: null })
    .eq("agency_id", agencyId);
  if (upProf) return { error: new Error(upProf.message) };

  const { error: dAg } = await admin.from("agencies").delete().eq("id", agencyId);
  if (dAg) return { error: new Error(dAg.message) };

  return { error: null };
}
