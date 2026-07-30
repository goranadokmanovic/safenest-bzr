import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isUuid } from "@/lib/api/agency-scope";
import {
  canManageAgencyBilling,
  isSuperAdmin,
  type AuthProfile,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { loadVisitAssignees } from "@/lib/api/visit-collaborators";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = { params: Promise<{ id: string }> };

const addSchema = z.object({
  user_id: z.string().uuid(),
});

async function loadVisitOr404(
  supabase: SupabaseClient,
  profile: AuthProfile,
  id: string,
) {
  const { data: visit, error } = await supabase
    .from("field_visits")
    .select("id, agency_id, assigned_user_id, report_lock_status")
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !visit ||
    (!isSuperAdmin(profile) && visit.agency_id !== profile.agency_id)
  ) {
    return null;
  }
  return visit;
}

export const GET = withApiCatch(async (
  _request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const visit = await loadVisitOr404(supabase, profile, id);
  if (!visit) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const assignees = await loadVisitAssignees(
    supabase,
    id,
    visit.assigned_user_id as string | null,
  );

  return jsonOk({ assignees });
});

export const POST = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const visit = await loadVisitOr404(supabase, profile, id);
  if (!visit) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const canManage =
    isSuperAdmin(profile) ||
    canManageAgencyBilling(profile) ||
    visit.assigned_user_id === user.id;

  if (!canManage) {
    return jsonError(
      "Samo primarni radnik ili vlasnik može da dodaje saradnike.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  if (visit.report_lock_status === "closed") {
    return jsonError(
      "Ne može se menjati tim dok je zapisnik zatvoren.",
      409,
      { code: "REPORT_CLOSED" },
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = addSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const targetId = parsed.data.user_id;
  if (targetId === visit.assigned_user_id) {
    return jsonError("Korisnik je već primarni radnik na poseti.", 400, {
      code: "ALREADY_PRIMARY",
    });
  }

  let targetOk = false;
  try {
    const admin = createAdminSupabaseClient();
    const { data: target } = await admin
      .from("profiles")
      .select("user_id, agency_id, role")
      .eq("user_id", targetId)
      .maybeSingle();
    targetOk =
      !!target &&
      target.agency_id === visit.agency_id &&
      target.role !== "super_admin";
  } catch {
    const { data: target } = await supabase
      .from("profiles")
      .select("user_id, agency_id")
      .eq("user_id", targetId)
      .maybeSingle();
    targetOk = !!target && target.agency_id === visit.agency_id;
  }

  if (!targetOk) {
    return jsonError("Korisnik nije član ove agencije.", 400, {
      code: "INVALID_USER",
    });
  }

  const { error } = await supabase.from("field_visit_collaborators").upsert(
    {
      field_visit_id: id,
      user_id: targetId,
      added_by: user.id,
    },
    { onConflict: "field_visit_id,user_id" },
  );

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const assignees = await loadVisitAssignees(
    supabase,
    id,
    visit.assigned_user_id as string | null,
  );

  return jsonOk({ assignees });
});

export const DELETE = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const visit = await loadVisitOr404(supabase, profile, id);
  if (!visit) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const canManage =
    isSuperAdmin(profile) ||
    canManageAgencyBilling(profile) ||
    visit.assigned_user_id === user.id;

  if (!canManage) {
    return jsonError(
      "Samo primarni radnik ili vlasnik može da ukloni saradnike.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  if (visit.report_lock_status === "closed") {
    return jsonError(
      "Ne može se menjati tim dok je zapisnik zatvoren.",
      409,
      { code: "REPORT_CLOSED" },
    );
  }

  const userId = new URL(request.url).searchParams.get("user_id")?.trim();
  if (!userId || !isUuid(userId)) {
    return jsonError("Nedostaje user_id.", 400, { code: "VALIDATION_ERROR" });
  }

  const { error } = await supabase
    .from("field_visit_collaborators")
    .delete()
    .eq("field_visit_id", id)
    .eq("user_id", userId);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  await supabase
    .from("field_visit_signatures")
    .delete()
    .eq("field_visit_id", id)
    .eq("user_id", userId);

  const assignees = await loadVisitAssignees(
    supabase,
    id,
    visit.assigned_user_id as string | null,
  );

  return jsonOk({ assignees });
});
