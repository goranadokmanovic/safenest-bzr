import { z } from "zod";
import { AGENCY_PLAN_IDS } from "@/lib/plans/catalog";

export function normalizeOperationAddresses(
  values: string[] | undefined | null,
): string[] {
  if (!values?.length) return [];
  return values.map((s) => s.trim()).filter(Boolean);
}

export const clientCreateSchema = z.object({
  agency_id: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  legal_name: z.string().max(500).nullable().optional(),
  tax_id: z.string().max(100).nullable().optional(),
  activity_sector: z.string().max(200).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  operation_addresses: z.array(z.string().max(1000)).max(20).optional(),
  contact_email: z
    .union([z.string().email().max(320), z.literal("")])
    .nullable()
    .optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  semaphore: z.enum(["green", "yellow", "red"]).optional(),
  notes: z.string().max(10000).nullable().optional(),
  /** profiles.user_id — agency_collaborator iste agencije, ili null = nedodeljen */
  assigned_collaborator_id: z.string().uuid().nullable().optional(),
});

export const clientPatchSchema = clientCreateSchema
  .partial()
  .omit({ agency_id: true })
  .extend({
    /** Vraćanje iz arhive: pošalji null. Datum se postavlja serverski (DELETE). */
    archived_at: z.null().optional(),
  });

export const employeeCreateSchema = z.object({
  first_name: z.string().min(1).max(200),
  last_name: z.string().min(1).max(200),
  position: z.string().max(200).nullable().optional(),
  personal_id_masked: z.string().max(50).nullable().optional(),
  employment_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  active: z.boolean().optional(),
});

export const employeePatchSchema = employeeCreateSchema.partial();

/** Najveći broj radnika u jednom bulk zahtevu (uvoz iz tabele šalje u serijama). */
export const MAX_EMPLOYEE_BULK = 500;

/**
 * POST /api/clients/[id]/employees prima jedan zapis, niz zapisa ili
 * `{ employees: [...] }`. Uvek se normalizuje na niz.
 */
export const employeeBulkCreateSchema = z.union([
  z.array(employeeCreateSchema).min(1).max(MAX_EMPLOYEE_BULK),
  z
    .object({
      employees: z.array(employeeCreateSchema).min(1).max(MAX_EMPLOYEE_BULK),
    })
    .transform((v) => v.employees),
  employeeCreateSchema.transform((v) => [v]),
]);

export const patchMeSchema = z.object({
  full_name: z.string().max(500).optional(),
  locale: z.enum(["sr", "en"]).optional(),
});

export const documentCreateSchema = z.object({
  storage_path: z.string().min(1).max(2000),
  filename: z.string().min(1).max(500),
  folder: z.enum(["bzr", "employment", "agency", "generated"]),
  mime_type: z.string().max(200).nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
});

export const documentPatchSchema = z
  .object({
    filename: z.string().min(1).max(500).optional(),
    folder: z.enum(["bzr", "employment", "agency", "generated"]).optional(),
    mime_type: z.string().max(200).nullable().optional(),
    client_company_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (d) =>
      d.filename !== undefined ||
      d.folder !== undefined ||
      d.mime_type !== undefined ||
      d.client_company_id !== undefined,
    { message: "Pošalji bar jedno polje za izmenu." },
  );

export const documentUploadUrlSchema = z.object({
  filename: z.string().min(1).max(500),
});

const DEADLINE_TYPES = ["medical", "training", "ppe", "document", "custom"] as const;

export const deadlineCreateSchema = z.object({
  agency_id: z.string().uuid().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  entity_type: z.enum(DEADLINE_TYPES),
  entity_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime({ offset: true }),
  title: z.string().max(500).nullable().optional(),
});

export const deadlinePatchSchema = z
  .object({
    client_company_id: z.string().uuid().nullable().optional(),
    entity_type: z.enum(DEADLINE_TYPES).optional(),
    entity_id: z.string().uuid().nullable().optional(),
    due_at: z.string().datetime({ offset: true }).optional(),
    title: z.union([z.string().max(500), z.null()]).optional(),
    reminder_sent_at: z
      .union([z.string().datetime({ offset: true }), z.null()])
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Pošalji bar jedno polje za izmenu.",
  });

export const notificationCreateSchema = z.object({
  /** Primalac; ako se izostavi, šalje se ulogovanom korisniku. */
  user_id: z.string().uuid().optional(),
  type: z.string().min(1).max(50).default("info"),
  title: z.string().min(1).max(300),
  body: z.string().max(5000).default(""),
  severity: z.enum(["info", "warning", "critical"]).nullable().optional(),
  dedupe_key: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const deadlinesQuerySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  type: z.enum(DEADLINE_TYPES).optional(),
});

export const stripeCheckoutBodySchema = z.object({
  planId: z.enum(AGENCY_PLAN_IDS),
  billingInterval: z.enum(["month", "year"]),
});

export const agencyPatchSchema = z
  .object({
    name: z.string().min(1).max(500).optional(),
    legal_name: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
    tax_id: z.union([z.string().max(100), z.literal(""), z.null()]).optional(),
    address: z.union([z.string().max(1000), z.literal(""), z.null()]).optional(),
    phone: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.legal_name !== undefined ||
      d.tax_id !== undefined ||
      d.address !== undefined ||
      d.phone !== undefined,
    { message: "Pošalji bar jedno polje za izmenu." },
  );

/** Admin: izmena pretplate agencije (vrednosti usklađene sa Stripe statusima). */
export const adminAgencyPatchSchema = z
  .object({
    subscription_status: z
      .enum([
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ])
      .optional(),
    plan_tier: z.enum(AGENCY_PLAN_IDS).optional(),
    trial_ends_at: z.union([z.string().min(4).max(40), z.null()]).optional(),
    /** Mora biti true — UI šalje nakon potvrde čekboksom. */
    acknowledge: z.literal(true),
  })
  .refine(
    (d) =>
      d.subscription_status !== undefined ||
      d.plan_tier !== undefined ||
      d.trial_ends_at !== undefined,
    { message: "Pošalji bar jedno polje za izmenu." },
  );

/** Admin: izmena uloge i/ili agencije (profiles). */
export const adminProfilePatchSchema = z
  .object({
    role: z
      .enum([
        "super_admin",
        "agency_owner",
        "agency_collaborator",
        "field_worker",
        "client_user",
      ])
      .optional(),
    agency_id: z.union([z.string().uuid(), z.null()]).optional(),
    acknowledge: z.literal(true),
  })
  .refine(
    (d) => d.role !== undefined || d.agency_id !== undefined,
    { message: "Pošalji role i/ili agency_id." },
  );

export const adminDeleteConfirmSchema = z.object({
  confirmPhrase: z.string().min(8).max(220),
});

export const fieldVisitCreateSchema = z.object({
  client_company_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  started_at: z.string().datetime({ offset: true }).nullable().optional(),
  completed_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z
    .enum(["draft", "in_progress", "completed", "cancelled"])
    .optional(),
  sync_status: z.enum(["pending", "synced", "failed"]).optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  offline_client_id: z.string().max(200).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  hitno_otklanjanje: z.boolean().optional(),
  parent_visit_id: z.string().uuid().nullable().optional(),
  visit_type: z
    .enum([
      "initial",
      "periodic",
      "control",
      "extraordinary",
      "advisory",
    ])
    .optional(),
  /** Soft conflict override — bez ovoga API vraća 409 SCHEDULING_CONFLICT. */
  acknowledge_conflicts: z.boolean().optional(),
  metadata: z
    .object({
      duration_hours: z.number().min(0).max(24).nullable().optional(),
      risk_level: z.string().max(50).optional(),
      extracted_text: z.string().max(100000).optional(),
    })
    .passthrough()
    .optional(),
});

export const voiceRecordingCreateSchema = z.object({
  field_visit_id: z.string().uuid().nullable().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  duration_seconds: z.number().int().nonnegative().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const fieldPhotoCreateSchema = z.object({
  field_visit_id: z.string().uuid(),
  ocr_text: z.string().max(100000).nullable().optional(),
  ocr_confidence: z.number().min(0).max(100).nullable().optional(),
  extracted_dates: z.record(z.string(), z.unknown()).nullable().optional(),
});
