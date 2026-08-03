import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { findSchedulingConflicts } from "@/lib/field-visits/scheduling-conflicts";
import { z } from "zod";

const bodySchema = z.object({
  client_company_id: z.string().uuid(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_hours: z.number().min(0).max(24).nullable().optional(),
  exclude_visit_id: z.string().uuid().nullable().optional(),
});

/** Soft precheck — ne upisuje. Koristi ga FieldVisitForm pre offline queue. */
export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  if (!profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const conflicts = await findSchedulingConflicts(supabase, {
    agencyId: profile.agency_id,
    clientCompanyId: parsed.data.client_company_id,
    assignedUserId: parsed.data.assigned_user_id ?? user.id,
    scheduledAt: parsed.data.scheduled_at,
    durationHours: parsed.data.duration_hours,
    excludeVisitId: parsed.data.exclude_visit_id,
  });

  return jsonOk({ conflicts });
});
