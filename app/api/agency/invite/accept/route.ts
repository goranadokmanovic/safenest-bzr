import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { resolveInviteStatus } from "@/lib/api/invite-code";
import { wouldExceedAgencySeatLimit } from "@/lib/plans/seats";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";

const bodySchema = z.object({
  code: z.string().trim().min(8).max(128),
});

export const POST = withApiCatch(async (request: Request) => {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return jsonError("Server nije konfigurisan.", 500, { code: "CONFIG_ERROR" });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Niste prijavljeni.", 401, { code: "UNAUTHORIZED" });
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError(
      "Dodaj SUPABASE_SERVICE_ROLE_KEY u .env.local.",
      503,
      { code: "CONFIG_ERROR" },
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Kod pozivnice je obavezan.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  // Prefer SECURITY DEFINER RPC (radi i ako service role/RLS zakaže)
  let invite: {
    id: string;
    agency_id: string;
    email: string | null;
    role: string;
    expires_at: string;
    used_at: string | null;
  } | null = null;

  const { data: rpcRows, error: rpcError } = await admin.rpc(
    "get_agency_invite_by_code",
    { p_code: parsed.data.code },
  );
  if (!rpcError) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row?.id) invite = row;
  } else {
    const { data, error: inviteError } = await admin
      .from("agency_invites")
      .select("id, agency_id, email, role, expires_at, used_at, used_by")
      .eq("invite_code", parsed.data.code)
      .maybeSingle();
    if (inviteError) {
      return jsonError(inviteError.message, 400, { code: "DATABASE_ERROR" });
    }
    invite = data;
  }

  if (!invite) {
    return jsonError("Pozivnica nije pronađena.", 404, {
      code: "INVITE_NOT_FOUND",
    });
  }

  const status = resolveInviteStatus({
    used_at: invite.used_at,
    expires_at: invite.expires_at,
  });
  if (status === "used") {
    return jsonError("Pozivnica je već iskorišćena.", 409, {
      code: "INVITE_ALREADY_USED",
    });
  }
  if (status === "expired") {
    return jsonError("Pozivnica je istekla.", 410, { code: "INVITE_EXPIRED" });
  }

  if (
    invite.email &&
    user.email &&
    invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    return jsonError(
      "Ova pozivnica je namenjena drugom email nalogu.",
      403,
      { code: "INVITE_EMAIL_MISMATCH" },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("user_id, agency_id, role, email, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return jsonError("Profil nije pronađen.", 400, { code: "PROFILE_MISSING" });
  }

  if (profile.role === "super_admin" || profile.role === "client_user") {
    return jsonError("Ovaj nalog ne može da primi pozivnicu.", 403, {
      code: "FORBIDDEN",
    });
  }

  if (profile.agency_id && profile.agency_id !== invite.agency_id) {
    return jsonError("Već ste član druge agencije.", 409, {
      code: "ALREADY_IN_AGENCY",
    });
  }

  if (
    profile.agency_id === invite.agency_id &&
    profile.role === "agency_collaborator"
  ) {
    // Idempotent: već prihvaćeno
    return jsonOk({ ok: true, already: true, agency_id: invite.agency_id });
  }

  const { data: agency } = await admin
    .from("agencies")
    .select("id, plan_tier")
    .eq("id", invite.agency_id)
    .maybeSingle();

  if (!agency) {
    return jsonError("Agencija nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  const seats = await wouldExceedAgencySeatLimit(
    admin,
    invite.agency_id,
    agency.plan_tier,
    { userId: user.id, currentAgencyId: profile.agency_id },
  );
  if (!seats.ok) {
    return jsonError(
      `Agencija je dostigla limit sedišta (${seats.current}/${seats.max}).`,
      403,
      { code: "SEAT_LIMIT", details: seats },
    );
  }

  const role =
    invite.role === "agency_owner" || invite.role === "field_worker"
      ? invite.role
      : "agency_collaborator";

  const memberRole =
    role === "agency_owner"
      ? "owner"
      : role === "field_worker"
        ? "field_worker"
        : "collaborator";

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : profile.full_name;

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      agency_id: invite.agency_id,
      role,
      ...(fullName ? { full_name: fullName } : {}),
    })
    .eq("user_id", user.id);

  if (updateError) {
    return jsonError(updateError.message, 400, { code: "DATABASE_ERROR" });
  }

  const { data: existingMember } = await admin
    .from("agency_members")
    .select("id")
    .eq("agency_id", invite.agency_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingMember) {
    const { error: memberError } = await admin.from("agency_members").insert({
      agency_id: invite.agency_id,
      user_id: user.id,
      member_role: memberRole,
      joined_at: new Date().toISOString(),
      invited_by: null,
    });
    if (memberError) {
      return jsonError(memberError.message, 400, { code: "DATABASE_ERROR" });
    }
  }

  const usedAt = new Date().toISOString();
  const { error: markError } = await admin
    .from("agency_invites")
    .update({ used_at: usedAt, used_by: user.id })
    .eq("id", invite.id)
    .is("used_at", null);

  if (markError) {
    return jsonError(markError.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(admin, {
    agency_id: invite.agency_id,
    actor_user_id: user.id,
    action: "agency_invite.accepted",
    entity_type: "agency_invite",
    entity_id: invite.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[agency-invites] accept audit failed", audit.error);
  }

  return jsonOk({
    ok: true,
    agency_id: invite.agency_id,
    role,
  });
});
