import type { SupabaseClient } from "@supabase/supabase-js";

export type DetailedAuditPayload = {
  agency_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertDetailedAudit(
  supabase: SupabaseClient,
  payload: DetailedAuditPayload,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("detailed_audit_logs").insert({
    agency_id: payload.agency_id,
    actor_user_id: payload.actor_user_id,
    action: payload.action,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    ip_address: payload.ip_address ?? null,
    user_agent: payload.user_agent ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
