import { z } from "zod";

export const clientCreateSchema = z.object({
  agency_id: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  legal_name: z.string().max(500).nullable().optional(),
  tax_id: z.string().max(100).nullable().optional(),
  activity_sector: z.string().max(200).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  contact_email: z
    .union([z.string().email().max(320), z.literal("")])
    .nullable()
    .optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  semaphore: z.enum(["green", "yellow", "red"]).optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export const clientPatchSchema = clientCreateSchema
  .partial()
  .omit({ agency_id: true });

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

export const deadlinesQuerySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  type: z
    .enum(["medical", "training", "ppe", "document", "custom"])
    .optional(),
});

export const stripeCheckoutBodySchema = z.object({
  planId: z.enum(["agency_basic", "agency_l", "agency_xl"]),
  billingInterval: z.enum(["month", "year"]),
});

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
    plan_tier: z.string().min(1).max(64).optional(),
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
