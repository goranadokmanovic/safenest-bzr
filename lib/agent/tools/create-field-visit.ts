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

const argsSchema = z.object({
  client_name: z.string().min(1),
  worker_name: z.string().min(1),
  datetime: z.string().min(1),
});

/**
 * Faza B — samo predlog. Upis ide kroz POST /api/field-visits posle potvrde.
 */
export const createFieldVisit: AgentTool = {
  name: "createFieldVisit",
  definition: {
    type: "function",
    function: {
      name: "createFieldVisit",
      description:
        "Predlaže kreiranje nove terenske posete. Ne kreira posetu sama — priprema predlog koji korisnik mora da potvrdi dugmetom. Koristi kada korisnik traži da se zakaže / kreira poseta za klijenta i člana agencije.",
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
        },
        required: ["client_name", "worker_name", "datetime"],
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

    const scheduledLabel = formatBelgradeDateTime(when.iso);
    const summary = `Nova terenska poseta: ${clientArg.client.name}, ${workerArg.worker.full_name}, ${scheduledLabel}`;

    return {
      ok: true,
      data: {
        status: "pending_confirmation",
        summary,
        display: {
          client_name: clientArg.client.name,
          worker_name: workerArg.worker.full_name,
          scheduled_at_label: scheduledLabel,
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
        },
        execute: {
          method: "POST",
          path: "/api/field-visits",
          body: {
            client_company_id: clientArg.client.id,
            assigned_user_id: workerArg.worker.user_id,
            scheduled_at: when.iso,
            status: "draft",
          },
        },
      },
    };
  },
};
