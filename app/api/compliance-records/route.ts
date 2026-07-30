import { z } from "zod";
import { getMutationContext } from "@/lib/api/mutation-guards";
import {
  canReadAgencyRecords,
  getAuthContext,
  isClientPortalUser,
  isSuperAdmin,
} from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  COMPLIANCE_CATEGORIES,
  isComplianceRecordType,
  RECORD_TYPE_SUBJECT,
  type ComplianceRecordType,
} from "@/lib/compliance/types";

const createSchema = z.object({
  client_company_id: z.string().uuid(),
  record_type: z.enum([
    "medical_exam",
    "training_certification",
    "equipment_check",
  ]),
  subject_id: z.string().uuid().nullable().optional(),
  subject_name: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(300),
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

function categoryAllowed(
  recordType: ComplianceRecordType,
  category: string,
): boolean {
  const list = COMPLIANCE_CATEGORIES[recordType];
  return list.includes(category);
}

export const GET = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canReadAgencyRecords(profile)) {
    return jsonError("Nemate pristup.", 403, { code: "FORBIDDEN" });
  }

  const clientId = new URL(request.url).searchParams
    .get("client_company_id")
    ?.trim();
  if (!clientId || !isUuid(clientId)) {
    return jsonError("Nedostaje client_company_id.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data: client, error: cErr } = await supabase
    .from("client_companies")
    .select("id, agency_id")
    .eq("id", clientId)
    .maybeSingle();

  if (cErr || !client) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }
  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    client.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const { data, error } = await supabase
    .from("compliance_records")
    .select("*")
    .eq("client_company_id", clientId)
    .order("expiry_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ records: data ?? [] });
});

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = createSchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const body = parsed.data;
  if (!isComplianceRecordType(body.record_type)) {
    return jsonError("Nevažeći tip zapisa.", 400, { code: "VALIDATION_ERROR" });
  }
  if (!categoryAllowed(body.record_type, body.category)) {
    return jsonError("Nepoznata kategorija za izabrani tip.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data: client, error: cErr } = await supabase
    .from("client_companies")
    .select("id, agency_id")
    .eq("id", body.client_company_id)
    .maybeSingle();

  if (cErr || !client) {
    return jsonError("Klijent nije pronađen.", 404, { code: "NOT_FOUND" });
  }
  if (
    !isSuperAdmin(profile) &&
    profile.agency_id &&
    client.agency_id !== profile.agency_id
  ) {
    return jsonError("Nema pristupa.", 403, { code: "FORBIDDEN" });
  }

  const subjectType = RECORD_TYPE_SUBJECT[body.record_type];

  const { data, error } = await supabase
    .from("compliance_records")
    .insert({
      agency_id: client.agency_id,
      client_company_id: body.client_company_id,
      record_type: body.record_type,
      subject_type: subjectType,
      subject_id: subjectType === "worker" ? (body.subject_id ?? null) : null,
      subject_name: body.subject_name.trim(),
      category: body.category.trim(),
      issued_date: body.issued_date ?? null,
      expiry_date: body.expiry_date ?? null,
      document_url: body.document_url?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ record: data }, 201);
});
