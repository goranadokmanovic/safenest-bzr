import { z } from "zod";
import {
  canManageAgencyBilling,
  getAuthContext,
  isSuperAdmin,
} from "@/lib/api/session";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

const createSchema = z.object({
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
  note: z.string().trim().max(2000).optional().nullable(),
});

function requireOwner() {
  return async () => {
    const auth = await getAuthContext();
    if (!auth.ok) return { ok: false as const, response: auth.response };
    const { profile } = auth.ctx;
    if (!profile.agency_id) {
      return {
        ok: false as const,
        response: jsonError("Niste dodeljeni agenciji.", 403, {
          code: "FORBIDDEN",
        }),
      };
    }
    if (!canManageAgencyBilling(profile) && !isSuperAdmin(profile)) {
      return {
        ok: false as const,
        response: jsonError(
          "Samo vlasnik agencije može da upravlja delegacijama.",
          403,
          { code: "FORBIDDEN" },
        ),
      };
    }
    return { ok: true as const, ctx: auth.ctx };
  };
}

export const GET = withApiCatch(async () => {
  const gate = await requireOwner()();
  if (!gate.ok) return gate.response;
  const { profile, supabase } = gate.ctx;

  const { data, error } = await supabase
    .from("visit_delegations")
    .select(
      "id, agency_id, from_user_id, to_user_id, granted_by, active, note, created_at, revoked_at",
    )
    .eq("agency_id", profile.agency_id!)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const userIds = [
    ...new Set(
      (data ?? []).flatMap((d) => [d.from_user_id, d.to_user_id, d.granted_by]),
    ),
  ];

  // Imena preko service role — RLS inače vraća samo sopstveni profil (UUID fallback).
  const names = new Map<string, string>();
  let collaborators: Array<{
    user_id: string;
    full_name: string;
    email: string;
  }> = [];

  try {
    const admin = createAdminSupabaseClient();

    if (userIds.length > 0) {
      const { data: nameProfiles } = await admin
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      for (const p of nameProfiles ?? []) {
        const label = p.full_name?.trim() || p.email?.trim();
        if (label) names.set(p.user_id, label);
      }
    }

    const { data: collabProfiles } = await admin
      .from("profiles")
      .select("user_id, full_name, email, role")
      .eq("agency_id", profile.agency_id!)
      .eq("role", "agency_collaborator")
      .order("full_name", { ascending: true });

    collaborators = (collabProfiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name?.trim() || p.email || "Radnik",
      email: p.email ?? "",
    }));

    const { data: memberRows } = await admin
      .from("agency_members")
      .select("user_id, member_role")
      .eq("agency_id", profile.agency_id!)
      .eq("member_role", "collaborator");

    const missingIds = (memberRows ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => !collaborators.some((c) => c.user_id === id));

    if (missingIds.length > 0) {
      const { data: extra } = await admin
        .from("profiles")
        .select("user_id, full_name, email, role")
        .in("user_id", missingIds);
      for (const p of extra ?? []) {
        if (p.role === "agency_owner") continue;
        collaborators.push({
          user_id: p.user_id,
          full_name: p.full_name?.trim() || p.email || "Radnik",
          email: p.email ?? "",
        });
      }
      collaborators.sort((a, b) =>
        a.full_name.localeCompare(b.full_name, "sr"),
      );
    }
  } catch (err) {
    console.warn("[delegations] profile lookup failed", err);
  }

  const displayName = (userId: string) =>
    names.get(userId) || "Nepoznat radnik";

  const delegations = (data ?? []).map((d) => ({
    ...d,
    from_user_name: displayName(d.from_user_id),
    to_user_name: displayName(d.to_user_id),
  }));

  return jsonOk({ delegations, collaborators });
});

export const POST = withApiCatch(async (request: Request) => {
  const gate = await requireOwner()();
  if (!gate.ok) return gate.response;
  const { profile, supabase, user } = gate.ctx;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = createSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { from_user_id, to_user_id, note } = parsed.data;
  if (from_user_id === to_user_id) {
    return jsonError("Radnici moraju biti različiti.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  let workers: Array<{ user_id: string; agency_id: string | null; role: string }> =
    [];
  try {
    const admin = createAdminSupabaseClient();
    const { data, error: workersErr } = await admin
      .from("profiles")
      .select("user_id, agency_id, role")
      .eq("agency_id", profile.agency_id!)
      .in("user_id", [from_user_id, to_user_id]);
    if (workersErr) {
      return jsonError(workersErr.message, 400, { code: "DATABASE_ERROR" });
    }
    workers = data ?? [];
  } catch {
    const { data, error: workersErr } = await supabase
      .from("profiles")
      .select("user_id, agency_id, role")
      .eq("agency_id", profile.agency_id!)
      .in("user_id", [from_user_id, to_user_id]);
    if (workersErr) {
      return jsonError(workersErr.message, 400, { code: "DATABASE_ERROR" });
    }
    workers = data ?? [];
  }

  if (workers.length !== 2) {
    return jsonError("Oba radnika moraju pripadati tvojoj agenciji.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  if (workers.some((w) => w.role !== "agency_collaborator")) {
    return jsonError(
      "Delegacija je dozvoljena samo između terenskih radnika (agency_collaborator).",
      400,
      { code: "VALIDATION_ERROR" },
    );
  }

  const { data: existing } = await supabase
    .from("visit_delegations")
    .select("id")
    .eq("agency_id", profile.agency_id!)
    .eq("from_user_id", from_user_id)
    .eq("to_user_id", to_user_id)
    .eq("active", true)
    .maybeSingle();

  if (existing) {
    return jsonError("Aktivna delegacija za ovaj par već postoji.", 409, {
      code: "CONFLICT",
    });
  }

  const { data, error } = await supabase
    .from("visit_delegations")
    .insert({
      agency_id: profile.agency_id,
      from_user_id,
      to_user_id,
      granted_by: user.id,
      active: true,
      note: note?.trim() || null,
    })
    .select(
      "id, agency_id, from_user_id, to_user_id, granted_by, active, note, created_at, revoked_at",
    )
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  await insertDetailedAudit(supabase, {
    agency_id: profile.agency_id!,
    actor_user_id: user.id,
    action: "visit_delegation.created",
    entity_type: "visit_delegation",
    entity_id: data.id,
    metadata: { from_user_id, to_user_id },
  });

  return jsonOk({ delegation: data }, 201);
});
