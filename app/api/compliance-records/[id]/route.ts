import { z } from "zod";
import { getMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  COMPLIANCE_CATEGORIES,
  isComplianceRecordType,
  type ComplianceRecordType,
} from "@/lib/compliance/types";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  subject_name: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().min(1).max(300).optional(),
  issued_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  document_url: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export const PATCH = withApiCatch(async (
  request: Request,
  { params }: Params,
) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("compliance_records")
    .select("id, agency_id, record_type")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return jsonError("Zapis nije pronađen.", 404, { code: "NOT_FOUND" });
  }
  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const body = parsed.data;
  if (
    body.category &&
    isComplianceRecordType(existing.record_type) &&
    !COMPLIANCE_CATEGORIES[existing.record_type as ComplianceRecordType].includes(
      body.category,
    )
  ) {
    return jsonError("Nepoznata kategorija za tip zapisa.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const payload: Record<string, unknown> = {};
  if (body.subject_id !== undefined) payload.subject_id = body.subject_id;
  if (body.subject_name !== undefined) payload.subject_name = body.subject_name;
  if (body.category !== undefined) payload.category = body.category;
  if (body.issued_date !== undefined) payload.issued_date = body.issued_date;
  if (body.expiry_date !== undefined) payload.expiry_date = body.expiry_date;
  if (body.document_url !== undefined) {
    payload.document_url = body.document_url?.trim() || null;
  }
  if (body.notes !== undefined) payload.notes = body.notes?.trim() || null;

  if (Object.keys(payload).length === 0) {
    return jsonError("Nema polja za izmenu.", 400, { code: "VALIDATION_ERROR" });
  }

  const { data, error } = await supabase
    .from("compliance_records")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ record: data });
});

export const DELETE = withApiCatch(async (
  _request: Request,
  { params }: Params,
) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;
  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Nevažeći id.", 400, { code: "INVALID_ID" });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("compliance_records")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return jsonError("Zapis nije pronađen.", 404, { code: "NOT_FOUND" });
  }
  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    existing.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const { error } = await supabase
    .from("compliance_records")
    .delete()
    .eq("id", id);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ ok: true });
});
