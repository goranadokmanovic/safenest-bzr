import { getFieldMutationContext } from "@/lib/api/mutation-guards";

import { insertDetailedAudit } from "@/lib/api/detailed-audit";

import { isUuid } from "@/lib/api/agency-scope";

import {
  canManageAgencyBilling,
  isSuperAdmin,
} from "@/lib/api/session";

import { jsonError, jsonOk } from "@/lib/api/responses";

import { withApiCatch } from "@/lib/api/with-api-catch";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { readJsonBody } from "@/lib/api/read-json";
import { z } from "zod";
import {
  FIELD_AUDIO_BUCKET,
  FIELD_AUDIO_SIGNED_URL_TTL_SEC,
} from "@/lib/api/audio-storage";
import { reportFieldsToText } from "@/lib/api/report-fields";
import {
  hasActiveReopenRequest,
  normalizeReportLockStatus,
  REPORT_LOCK_SELECT,
} from "@/lib/api/report-lock";
import {
  loadVisitAssignees,
  loadVisitSignatures,
  userHasSignedVisit,
} from "@/lib/api/visit-collaborators";

type Params = { params: Promise<{ id: string }> };

const visitPatchSchema = z
  .object({
    transcript: z.string().max(200_000).optional(),
    report: z.string().max(200_000).optional(),
    report_fields: z.record(z.string(), z.string().max(50_000)).optional(),
  })
  .refine(
    (d) =>
      d.transcript !== undefined ||
      d.report !== undefined ||
      d.report_fields !== undefined,
    {
      message: "Pošalji transcript, report i/ili report_fields.",
    },
  );

function normalizeTranscriptStatus(
  value: unknown,
): "pending" | "processing" | "done" | "failed" {
  if (
    value === "processing" ||
    value === "done" ||
    value === "failed" ||
    value === "pending"
  ) {
    return value;
  }
  return "pending";
}

function normalizeReportStatus(
  value: unknown,
): "pending" | "processing" | "done" | "failed" | "skipped" {
  if (
    value === "processing" ||
    value === "done" ||
    value === "failed" ||
    value === "pending" ||
    value === "skipped"
  ) {
    return value;
  }
  return "pending";
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

  const { data: visit, error } = await supabase
    .from("field_visits")
    .select(
      `id, agency_id, assigned_user_id, updated_at, audio_url, transcript, transcript_status, noise_mode, report_template_id, report, report_fields, report_status, ${REPORT_LOCK_SELECT}`,
    )
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !visit ||
    (!isSuperAdmin(profile) && visit.agency_id !== profile.agency_id)
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  let audioSrc: string | null = null;
  if (typeof visit.audio_url === "string" && visit.audio_url) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(FIELD_AUDIO_BUCKET)
      .createSignedUrl(visit.audio_url, FIELD_AUDIO_SIGNED_URL_TTL_SEC);
    if (signErr) {
      console.error("[field-visits] audio signed URL failed", signErr.message);
    } else {
      audioSrc = signed?.signedUrl ?? null;
    }
  }

  const assignees = await loadVisitAssignees(
    supabase,
    id,
    (visit.assigned_user_id as string | null) ?? null,
  );
  const signatures = await loadVisitSignatures(supabase, id);
  const currentUserSigned = signatures.some((s) => s.user_id === profile.user_id);

  return jsonOk({
    field_visit: {
      id: visit.id,
      assigned_user_id: visit.assigned_user_id ?? null,
      updated_at: visit.updated_at ?? null,
      audio_url: visit.audio_url ?? null,
      audio_src: audioSrc,
      transcript: visit.transcript ?? null,
      transcript_status: normalizeTranscriptStatus(visit.transcript_status),
      noise_mode:
        visit.noise_mode === "quiet" || visit.noise_mode === "noisy"
          ? visit.noise_mode
          : null,
      report_template_id: visit.report_template_id ?? null,
      report: visit.report ?? null,
      report_fields:
        visit.report_fields &&
        typeof visit.report_fields === "object" &&
        !Array.isArray(visit.report_fields)
          ? visit.report_fields
          : null,
      report_status: normalizeReportStatus(visit.report_status),
      report_lock_status: normalizeReportLockStatus(visit.report_lock_status),
      report_closed_at: visit.report_closed_at ?? null,
      report_closed_by: visit.report_closed_by ?? null,
      reopen_requested_at: visit.reopen_requested_at ?? null,
      reopen_requested_by: visit.reopen_requested_by ?? null,
      reopen_justification: visit.reopen_justification ?? null,
      reopen_approved_by: visit.reopen_approved_by ?? null,
      reopen_approved_at: visit.reopen_approved_at ?? null,
      signature_statement: visit.signature_statement ?? null,
      report_content_hash: visit.report_content_hash ?? null,
      reopen_request_active: hasActiveReopenRequest({
        report_lock_status: visit.report_lock_status,
        reopen_requested_at: visit.reopen_requested_at,
        reopen_approved_at: visit.reopen_approved_at,
      }),
      can_approve_reopen:
        isSuperAdmin(profile) || canManageAgencyBilling(profile),
      assignees,
      signatures,
      current_user_signed: currentUserSigned,
    },
  });
});

export const PATCH = withApiCatch(async (
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

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = visitPatchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: existing } = await supabase
    .from("field_visits")
    .select(`id, agency_id, report_lock_status`)
    .eq("id", id)
    .maybeSingle();
  if (
    !existing ||
    (!isSuperAdmin(profile) && existing.agency_id !== profile.agency_id)
  ) {
    return jsonError("Terenska poseta nije pronađena.", 404, {
      code: "NOT_FOUND",
    });
  }

  const reportLocked =
    normalizeReportLockStatus(existing.report_lock_status) === "closed";
  const touchingReport =
    parsed.data.report !== undefined ||
    parsed.data.report_fields !== undefined;

  if (reportLocked && touchingReport) {
    return jsonError(
      "Zapisnik je zatvoren i ne može se menjati. Zatraži ponovno otvaranje.",
      409,
      { code: "REPORT_LOCKED" },
    );
  }

  // Delimični potpis: potpisnik više ne može da menja zapisnik dok svi ne potpišu / reopen.
  if (touchingReport && (await userHasSignedVisit(supabase, id, user.id))) {
    return jsonError(
      "Već ste potpisali zapisnik — izmene nisu moguće dok se ne zatvori ili ponovo otvori.",
      409,
      { code: "ALREADY_SIGNED" },
    );
  }

  const payload: Record<string, unknown> = {};
  const responseBody: Record<string, unknown> = {};

  if (parsed.data.transcript !== undefined) {
    const transcript = parsed.data.transcript.trim();
    payload.transcript = transcript || null;
    payload.transcript_status = "done";
    responseBody.transcript = transcript || null;
    responseBody.transcript_status = "done";
  }
  if (parsed.data.report_fields !== undefined) {
    const fields = parsed.data.report_fields;
    const reportText = reportFieldsToText(fields);
    payload.report_fields = fields;
    payload.report = reportText || null;
    payload.report_status = "done";
    responseBody.report_fields = fields;
    responseBody.report = reportText || null;
    responseBody.report_status = "done";
  } else if (parsed.data.report !== undefined) {
    const report = parsed.data.report.trim();
    payload.report = report || null;
    payload.report_status = "done";
    responseBody.report = report || null;
    responseBody.report_status = "done";
  }

  const { error } = await supabase
    .from("field_visits")
    .update(payload)
    .eq("id", id);
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  const touchedReport =
    parsed.data.report !== undefined ||
    parsed.data.report_fields !== undefined;

  const audit = await insertDetailedAudit(supabase, {
    agency_id: existing.agency_id,
    actor_user_id: user.id,
    action: touchedReport
      ? "field_visit.report_updated"
      : "field_visit.transcript_updated",
    entity_type: "field_visit",
    entity_id: id,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user_agent: request.headers.get("user-agent"),
  });
  if (audit.error) {
    console.error("[field-visits] patch audit failed", audit.error);
  }

  return jsonOk(responseBody);
});



export const DELETE = withApiCatch(async (request: Request, { params }: Params) => {

  const guard = await getFieldMutationContext();

  if (!guard.ok) return guard.response;

  const { profile, supabase, user } = guard.ctx;



  const { id } = await params;

  if (!isUuid(id)) {

    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });

  }



  const { data: existing, error: loadErr } = await supabase

    .from("field_visits")

    .select("id, agency_id, client_company_id, audio_url")

    .eq("id", id)

    .maybeSingle();



  if (loadErr || !existing) {

    return jsonError("Terenska poseta nije pronađena.", 404, {

      code: "NOT_FOUND",

    });

  }



  if (

    !isSuperAdmin(profile) &&

    (!profile.agency_id || existing.agency_id !== profile.agency_id)

  ) {

    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });

  }



  // Service role za DELETE — zaobilazi RLS (has_agency_access u bazi može imati

  // pogrešno poređenje text = member_role enum pri CASCADE brisanju field_photos).

  let admin;

  try {

    admin = createAdminSupabaseClient();

  } catch {

    return jsonError("Nema SUPABASE_SERVICE_ROLE_KEY.", 503, {

      code: "CONFIG_ERROR",

    });

  }



  const { error } = await admin.from("field_visits").delete().eq("id", id);

  if (error) {

    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });

  }

  if (existing.audio_url) {
    const { error: storageError } = await admin.storage
      .from(FIELD_AUDIO_BUCKET)
      .remove([existing.audio_url]);
    if (storageError) {
      console.error(
        "[field-visits] audio removal failed",
        storageError.message,
      );
    }
  }



  const audit = await insertDetailedAudit(admin, {

    agency_id: existing.agency_id,

    actor_user_id: user.id,

    action: "field_visit.deleted",

    entity_type: "field_visit",

    entity_id: id,

    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),

    user_agent: request.headers.get("user-agent"),

    metadata: { client_company_id: existing.client_company_id },

  });

  if (audit.error) {

    console.error("[field-visits] audit log failed", audit.error);

  }



  return jsonOk({ ok: true });

});


