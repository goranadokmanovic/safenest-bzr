import { z } from "zod";
import {
  countFieldVisitsByUser,
  resolvePeriod,
  type PeriodInput,
} from "@/lib/queries/field-visits";
import { resolveClientArg, resolveWorkerArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

/**
 * Period je namerno ravan (period_type + pojedinačna polja) umesto ugnježđene
 * unije — strict function calling loše podnosi `oneOf`, a modeli mnogo
 * pouzdanije popunjavaju ravnu strukturu.
 */
const argsSchema = z.object({
  worker_name: z.string().nullable(),
  client_name: z.string().nullable(),
  period_type: z.enum(["month", "quarter", "range"]),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  quarter: z.number().int().nullable(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
});

export const getVisitCountByAgencyUser: AgentTool = {
  name: "getVisitCountByAgencyUser",
  definition: {
    type: "function",
    function: {
      name: "getVisitCountByAgencyUser",
      description:
        "Broj terenskih poseta u zadatom periodu, ukupno i razbijeno po članu agencije koji je zadužen za posetu. Koristi kada korisnik pita koliko je poseta neko obavio. VAŽNO: 'radnik' ovde znači član agencije (kolega), ne radnik klijenta. Ako korisnik ne imenuje osobu, prosledi worker_name = null i dobićeš razbijanje po svima.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          worker_name: {
            type: ["string", "null"],
            description:
              "Ime člana agencije, onako kako ga je korisnik izgovorio. null = svi članovi.",
          },
          client_name: {
            type: ["string", "null"],
            description: "Naziv klijenta za dodatno filtriranje. null = svi klijenti.",
          },
          period_type: {
            type: "string",
            enum: ["month", "quarter", "range"],
            description:
              "'month' uz month (+year), 'quarter' uz quarter (+year), 'range' uz date_from i date_to.",
          },
          year: {
            type: ["integer", "null"],
            description: "Godina. null = tekuća godina.",
          },
          month: {
            type: ["integer", "null"],
            description: "Mesec 1-12. Obavezan za period_type='month'.",
          },
          quarter: {
            type: ["integer", "null"],
            description: "Kvartal 1-4. Obavezan za period_type='quarter'.",
          },
          date_from: {
            type: ["string", "null"],
            description: "YYYY-MM-DD. Obavezan za period_type='range'.",
          },
          date_to: {
            type: ["string", "null"],
            description: "YYYY-MM-DD. Obavezan za period_type='range'.",
          },
        },
        required: [
          "worker_name",
          "client_name",
          "period_type",
          "year",
          "month",
          "quarter",
          "date_from",
          "date_to",
        ],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: "Neispravni argumenti za getVisitCountByAgencyUser." };
    }

    const period = resolvePeriod(
      parsed.data as PeriodInput,
      ctx.todayIso,
      ctx.locale,
    );
    if (!period.ok) {
      return { ok: false, error: period.message };
    }

    const worker = await resolveWorkerArg(ctx, parsed.data.worker_name);
    if (worker.kind === "halt") return worker.outcome;

    const client = await resolveClientArg(ctx, parsed.data.client_name);
    if (client.kind === "halt") return client.outcome;

    const result = await countFieldVisitsByUser(ctx.supabase, {
      agencyId: ctx.agencyId,
      period: period.value,
      assignedUserId: worker.kind === "one" ? worker.worker.user_id : null,
      clientCompanyId: client.kind === "one" ? client.client.id : null,
    });

    if (!result.ok) return { ok: false, error: result.message };

    return {
      ok: true,
      data: {
        status: result.value.total === 0 ? "empty" : "ok",
        period: period.value.label,
        period_from: period.value.from,
        period_to: period.value.to,
        worker: worker.kind === "one" ? worker.worker.full_name : null,
        client: client.kind === "one" ? client.client.name : null,
        total_visits: result.value.total,
        by_worker: result.value.by_user,
        truncated: result.value.truncated,
      },
    };
  },
};
