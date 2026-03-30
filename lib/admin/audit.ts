import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAuditPayload = {
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
};

export async function insertAdminAudit(
  admin: SupabaseClient,
  payload: AdminAuditPayload,
): Promise<{ error: Error | null }> {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_user_id: payload.actor_user_id,
    action: payload.action,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    metadata: payload.metadata ?? {},
  });
  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
