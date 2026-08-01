import { z } from "zod";
import { formatBelgradeDate, parseAgentDate } from "@/lib/agent/dates";
import { canMutateAgencyRecords } from "@/lib/api/session";
import { isComplianceRecordType } from "@/lib/compliance/types";
import {
  PENDING_CONFIRMATION_HINT,
  recordTypeLabel,
  resolveClientArg,
  resolveComplianceRecordArg,
} from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().min(1),
  subject_name: z.string().min(1),
  category: z.string().nullable(),
  record_type: z
    .enum(["medical_exam", "training_certification", "equipment_check"])
    .nullable(),
  new_expiry_date: z.string().min(1),
});

/**
 * Faza B — samo predlog. Upis ide kroz PATCH /api/compliance-records/[id].
 */
export const updateComplianceRecordExpiry: AgentTool = {
  name: "updateComplianceRecordExpiry",
  definition: {
    type: "function",
    function: {
      name: "updateComplianceRecordExpiry",
      description:
        "Predlaže promenu datuma isteka postojećeg compliance zapisa (lekarski, osposobljavanje, pregled opreme). Ne menja ništa sama — priprema predlog za potvrdu. Obavezno prosledi client_name i subject_name (ime radnika ili opreme).",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: "string",
            description: "Naziv klijenta kome pripada zapis.",
          },
          subject_name: {
            type: "string",
            description:
              "Ime radnika klijenta ili naziv opreme na zapisu (subject_name).",
          },
          category: {
            type: ["string", "null"],
            description:
              "Kategorija zapisa ako je korisnik pomenuo (npr. Oftalmološki pregled). null ako nije jasna.",
          },
          record_type: {
            type: ["string", "null"],
            enum: [
              "medical_exam",
              "training_certification",
              "equipment_check",
              null,
            ],
            description:
              "Tip zapisa ako je poznat. null ako korisnik nije precizirao.",
          },
          new_expiry_date: {
            type: "string",
            description: "Novi datum isteka, DD.MM.GGGG ili YYYY-MM-DD.",
          },
        },
        required: [
          "client_name",
          "subject_name",
          "category",
          "record_type",
          "new_expiry_date",
        ],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    if (!canMutateAgencyRecords(ctx.profile)) {
      return {
        ok: true,
        data: {
          status: "forbidden",
          hint: "Samo vlasnik ili saradnik agencije može da menja compliance rokove.",
        },
      };
    }

    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Neispravni argumenti za updateComplianceRecordExpiry.",
      };
    }

    const clientArg = await resolveClientArg(ctx, parsed.data.client_name);
    if (clientArg.kind === "halt") return clientArg.outcome;
    if (clientArg.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za izmenu roka je potreban konkretan klijent. Pitaj korisnika o kom klijentu je reč.",
        },
      };
    }

    const recordType =
      parsed.data.record_type && isComplianceRecordType(parsed.data.record_type)
        ? parsed.data.record_type
        : null;

    const recordArg = await resolveComplianceRecordArg(ctx, clientArg.client, {
      subjectName: parsed.data.subject_name,
      category: parsed.data.category,
      recordType,
    });
    if (recordArg.kind === "halt") return recordArg.outcome;

    const when = parseAgentDate(parsed.data.new_expiry_date);
    if (!when.ok) {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: when.error,
        },
      };
    }

    const record = recordArg.record;
    const typeLabel = recordTypeLabel(record.record_type);
    const newLabel = formatBelgradeDate(when.isoDate);
    const currentLabel = record.expiry_date
      ? formatBelgradeDate(record.expiry_date)
      : null;

    const summary = `Izmena roka: ${record.subject_name} (${typeLabel} — ${record.category}) kod ${clientArg.client.name} → ${newLabel}`;

    return {
      ok: true,
      data: {
        status: "pending_confirmation",
        summary,
        display: {
          client_name: clientArg.client.name,
          subject_name: record.subject_name,
          record_type_label: typeLabel,
          category: record.category,
          current_expiry_label: currentLabel,
          new_expiry_label: newLabel,
        },
        hint: PENDING_CONFIRMATION_HINT,
      },
      pendingAction: {
        kind: "updateComplianceRecordExpiry",
        summary,
        display: {
          client_name: clientArg.client.name,
          subject_name: record.subject_name,
          record_type_label: typeLabel,
          category: record.category,
          current_expiry_label: currentLabel,
          new_expiry_label: newLabel,
        },
        execute: {
          method: "PATCH",
          path: `/api/compliance-records/${record.id}`,
          body: { expiry_date: when.isoDate },
        },
      },
    };
  },
};
