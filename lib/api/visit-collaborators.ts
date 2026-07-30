import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requiredSignerIds,
  type VisitAssignee,
  type VisitSignatureRow,
} from "@/lib/api/report-signature";

export async function loadVisitCollaboratorIds(
  supabase: SupabaseClient,
  visitId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("field_visit_collaborators")
    .select("user_id")
    .eq("field_visit_id", visitId);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function loadVisitAssignees(
  supabase: SupabaseClient,
  visitId: string,
  assignedUserId: string | null,
): Promise<VisitAssignee[]> {
  const collabIds = await loadVisitCollaboratorIds(supabase, visitId);
  const ids = requiredSignerIds(assignedUserId, collabIds);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", ids);

  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.user_id as string,
      {
        full_name:
          (p.full_name as string | null)?.trim() ||
          (p.email as string | null)?.trim() ||
          (p.user_id as string).slice(0, 8),
        email: (p.email as string | null) ?? null,
      },
    ]),
  );

  const out: VisitAssignee[] = [];
  if (assignedUserId) {
    const p = byId.get(assignedUserId);
    out.push({
      user_id: assignedUserId,
      full_name: p?.full_name ?? assignedUserId.slice(0, 8),
      email: p?.email,
      role: "primary",
    });
  }
  for (const id of collabIds) {
    if (id === assignedUserId) continue;
    const p = byId.get(id);
    out.push({
      user_id: id,
      full_name: p?.full_name ?? id.slice(0, 8),
      email: p?.email,
      role: "collaborator",
    });
  }
  return out;
}

export async function loadVisitSignatures(
  supabase: SupabaseClient,
  visitId: string,
): Promise<VisitSignatureRow[]> {
  const { data } = await supabase
    .from("field_visit_signatures")
    .select("user_id, signed_at, signature_statement, report_content_hash")
    .eq("field_visit_id", visitId)
    .order("signed_at", { ascending: true });

  if (!data?.length) return [];

  const ids = data.map((r) => r.user_id as string);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", ids);
  const names = new Map(
    (profiles ?? []).map((p) => [
      p.user_id as string,
      (p.full_name as string | null)?.trim() ||
        (p.email as string | null)?.trim() ||
        (p.user_id as string).slice(0, 8),
    ]),
  );

  return data.map((r) => ({
    user_id: r.user_id as string,
    full_name: names.get(r.user_id as string) ?? (r.user_id as string).slice(0, 8),
    signed_at: r.signed_at as string,
    signature_statement: r.signature_statement as string,
    report_content_hash: (r.report_content_hash as string | null) ?? null,
  }));
}

export async function userHasSignedVisit(
  supabase: SupabaseClient,
  visitId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("field_visit_signatures")
    .select("id")
    .eq("field_visit_id", visitId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function clearVisitSignatures(
  supabase: SupabaseClient,
  visitId: string,
): Promise<void> {
  await supabase
    .from("field_visit_signatures")
    .delete()
    .eq("field_visit_id", visitId);
}
