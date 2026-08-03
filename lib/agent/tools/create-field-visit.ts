import { z } from "zod";
import {
  formatBelgradeDateTime,
  parseAgentDateTime,
} from "@/lib/agent/dates";
import {
  PENDING_CONFIRMATION_HINT,
  resolveClientArg,
  resolveWorkerArg,
} from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";
import {
  DEFAULT_VISIT_DURATION_HOURS,
  findSchedulingConflicts,
} from "@/lib/field-visits/scheduling-conflicts";
import {
  isVisitType,
  visitTypeLabel,
  type VisitType,
} from "@/lib/field-visits/visit-type";

const argsSchema = z.object({
  client_name: z.string().min(1),
  worker_name: z.string().min(1),
  datetime: z.string().min(1),
  visit_type: z
    .enum([
      "initial",
      "periodic",
      "control",
      "extraordinary",
      "advisory",
    ])
    .nullable(),
  duration_hours: z.number().nullable(),
});

function resolveDurationHours(raw: number | null): number {
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    raw > 0 &&
    raw <= 24
  ) {
    return raw;
  }
  return DEFAULT_VISIT_DURATION_HOURS;
}

/**
 * Faza B — samo predlog. Upis ide kroz POST /api/field-visits posle potvrde.
 * Tip „control” zahteva parent u UI formi — Zrna za sada predlaže non-control tipove
 * (control bez parent_visit_id bi pao na validaciji).
 */
export const createFieldVisit: AgentTool = {
  name: "createFieldVisit",
  definition: {
    type: "function",
    function: {
      name: "createFieldVisit",
      description:
        "Predlaže kreiranje nove terenske posete. Ne kreira posetu sama — priprema predlog koji korisnik mora da potvrdi dugmetom. Koristi kada korisnik traži da se zakaže / kreira poseta za klijenta i člana agencije. Za kontrolnu posetu (visit_type=control) usmeri korisnika na formu jer je potreban parent nalog — ovde prosledi visit_type=null ili periodic/initial/extraordinary/advisory. Trajanje (duration_hours) koristi se za proveru preklapanja; null = 1 sat.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: "string",
            description: "Naziv klijenta, onako kako ga je korisnik izgovorio.",
          },
          worker_name: {
            type: "string",
            description:
              "Ime člana agencije kome se poseta dodeljuje (ne radnik klijenta).",
          },
          datetime: {
            type: "string",
            description:
              "Zakazano vreme. Preferiraj ISO ili DD.MM.GGGG HH:mm u Europe/Belgrade. Ako korisnik kaže samo datum, stavi 09:00.",
          },
          visit_type: {
            type: ["string", "null"],
            enum: [
              "initial",
              "periodic",
              "control",
              "extraordinary",
              "advisory",
              null,
            ],
            description:
              "Tip posete. null = periodic. Ne koristi 'control' ovde (treba parent nalog u formi).",
          },
          duration_hours: {
            type: ["number", "null"],
            description:
              "Trajanje posete u satima (0–24]. null = 1 sat. Koristi se za proveru konflikata u rasporedu.",
          },
        },
        required: [
          "client_name",
          "worker_name",
          "datetime",
          "visit_type",
          "duration_hours",
        ],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: "Neispravni argumenti za createFieldVisit." };
    }

    const clientArg = await resolveClientArg(ctx, parsed.data.client_name);
    if (clientArg.kind === "halt") return clientArg.outcome;
    if (clientArg.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za novu posetu je potreban konkretan klijent. Pitaj korisnika o kom klijentu je reč.",
        },
      };
    }

    const workerArg = await resolveWorkerArg(ctx, parsed.data.worker_name);
    if (workerArg.kind === "halt") return workerArg.outcome;
    if (workerArg.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za novu posetu je potreban konkretan član agencije. Pitaj korisnika kome da se dodeli.",
        },
      };
    }

    const when = parseAgentDateTime(parsed.data.datetime);
    if (!when.ok) {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: when.error,
        },
      };
    }

    let visitType: VisitType = "periodic";
    if (parsed.data.visit_type && isVisitType(parsed.data.visit_type)) {
      visitType = parsed.data.visit_type;
    }
    if (visitType === "control") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint:
            ctx.locale === "en"
              ? "A follow-up (control) visit needs a parent order number. Ask the user to create it in the New visit form, or choose another visit type."
              : "Kontrolna poseta zahteva izbor originalnog naloga. Usmeri korisnika na formu „Nova poseta” ili izaberi drugi tip posete.",
        },
      };
    }

    const durationHours = resolveDurationHours(parsed.data.duration_hours);

    const conflicts = await findSchedulingConflicts(ctx.supabase, {
      agencyId: ctx.agencyId,
      clientCompanyId: clientArg.client.id,
      assignedUserId: workerArg.worker.user_id,
      scheduledAt: when.iso,
      durationHours,
    });

    const scheduledLabel = formatBelgradeDateTime(when.iso);
    const typeLabel = visitTypeLabel(visitType, ctx.locale);
    const durationLabel =
      ctx.locale === "en"
        ? `${durationHours} h`
        : `${String(durationHours).replace(".", ",")} h`;
    const conflictCount =
      conflicts.worker_overlaps.length + conflicts.client_same_day.length;
    const conflictNote =
      conflictCount > 0
        ? ctx.locale === "en"
          ? ` Warning: ${conflictCount} scheduling conflict(s) — confirm to proceed anyway.`
          : ` Upozorenje: ${conflictCount} konflikt(a) u rasporedu — potvrdom ipak zakazuješ.`
        : "";

    const summary =
      ctx.locale === "en"
        ? `New field visit (${typeLabel}): ${clientArg.client.name}, ${workerArg.worker.full_name}, ${scheduledLabel}, ${durationLabel}.${conflictNote}`
        : `Nova terenska poseta (${typeLabel}): ${clientArg.client.name}, ${workerArg.worker.full_name}, ${scheduledLabel}, ${durationLabel}.${conflictNote}`;

    return {
      ok: true,
      data: {
        status: "pending_confirmation",
        summary,
        display: {
          client_name: clientArg.client.name,
          worker_name: workerArg.worker.full_name,
          scheduled_at_label: scheduledLabel,
          visit_type_label: typeLabel,
          duration_hours_label: durationLabel,
          conflicts,
        },
        hint: PENDING_CONFIRMATION_HINT,
      },
      pendingAction: {
        kind: "createFieldVisit",
        summary,
        display: {
          client_name: clientArg.client.name,
          worker_name: workerArg.worker.full_name,
          scheduled_at_label: scheduledLabel,
          visit_type_label: typeLabel,
          duration_hours_label: durationLabel,
          conflicts: conflicts.has_conflicts
            ? {
                worker_overlaps: conflicts.worker_overlaps,
                client_same_day: conflicts.client_same_day,
              }
            : null,
        },
        execute: {
          method: "POST",
          path: "/api/field-visits",
          body: {
            client_company_id: clientArg.client.id,
            assigned_user_id: workerArg.worker.user_id,
            scheduled_at: when.iso,
            status: "draft",
            visit_type: visitType,
            metadata: { duration_hours: durationHours },
            acknowledge_conflicts: conflicts.has_conflicts ? true : undefined,
          },
        },
      },
    };
  },
};
