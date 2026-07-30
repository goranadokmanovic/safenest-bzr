import { z } from "zod";
import { getAuthContext } from "@/lib/api/session";
import {
  canManageAgencyBilling,
  isSuperAdmin,
} from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  generateInviteCode,
  inviteExpiresAt,
  resolveInviteStatus,
} from "@/lib/api/invite-code";

const createSchema = z.object({
  email: z
    .string()
    .trim()
    .max(320)
    .optional()
    .refine(
      (v) => v === undefined || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "Nevažeći email." },
    ),
});

export const GET = withApiCatch(async () => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da vidi pozivnice.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data, error } = await supabase
    .from("agency_invites")
    .select(
      "id, agency_id, email, invite_code, role, created_by, created_at, expires_at, used_at, used_by",
    )
    .eq("agency_id", profile.agency_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const invites = (data ?? []).map((row) => ({
    ...row,
    status: resolveInviteStatus({
      used_at: row.used_at,
      expires_at: row.expires_at,
    }),
  }));

  return jsonOk({ invites });
});

export const POST = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da kreira pozivnice.", 403, {
      code: "FORBIDDEN",
    });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = createSchema.safeParse(raw.value ?? {});
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const email = parsed.data.email?.trim() || null;
  const inviteCode = generateInviteCode();
  const expiresAt = inviteExpiresAt().toISOString();

  const { data, error } = await supabase
    .from("agency_invites")
    .insert({
      agency_id: profile.agency_id,
      email,
      invite_code: inviteCode,
      role: "agency_collaborator",
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select(
      "id, agency_id, email, invite_code, role, created_by, created_at, expires_at, used_at, used_by",
    )
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? "Kreiranje pozivnice nije uspelo.", 400, {
      code: "DATABASE_ERROR",
    });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: profile.agency_id,
    actor_user_id: user.id,
    action: "agency_invite.created",
    entity_type: "agency_invite",
    entity_id: data.id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[agency-invites] audit failed", audit.error);
  }

  return jsonOk(
    {
      invite: {
        ...data,
        status: "active" as const,
      },
    },
    201,
  );
});

/** Opoziv: DELETE /api/agency/invites?id=<uuid> (bez nested [id] rute — Windows/Turbopack). */
export const DELETE = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }
  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
    return jsonError("Samo vlasnik agencije može da opozove pozivnice.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data: existing } = await supabase
    .from("agency_invites")
    .select("id, agency_id, used_at")
    .eq("id", id)
    .maybeSingle();

  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Pozivnica nije pronađena.", 404, { code: "NOT_FOUND" });
  }

  if (existing.used_at) {
    return jsonError("Iskorišćena pozivnica se ne može obrisati.", 409, {
      code: "INVITE_ALREADY_USED",
    });
  }

  const { error } = await supabase.from("agency_invites").delete().eq("id", id);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: "agency_invite.revoked",
    entity_type: "agency_invite",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[agency-invites] delete audit failed", audit.error);
  }

  return jsonOk({ ok: true });
});
