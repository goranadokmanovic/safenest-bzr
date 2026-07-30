import { z } from "zod";
import { listUpcomingComplianceDeadlines } from "@/lib/queries/compliance";
import { resolveClientArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  days: z.number().int().min(1).max(365),
  client_name: z.string().nullable(),
  include_expired: z.boolean(),
});

export const getUpcomingDeadlines: AgentTool = {
  name: "getUpcomingDeadlines",
  definition: {
    type: "function",
    function: {
      name: "getUpcomingDeadlines",
      description:
        "Compliance rokovi (lekarski pregledi, stručna osposobljavanja, pregledi opreme) koji ističu u narednih N dana. Koristi kada korisnik pita šta uskoro ističe, šta je isteklo ili šta treba obnoviti.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
            description: "Broj dana unapred. Koristi 30 ako korisnik ne precizira.",
          },
          client_name: {
            type: ["string", "null"],
            description:
              "Naziv klijenta, onako kako ga je korisnik izgovorio. null = svi klijenti u opsegu korisnika.",
          },
          include_expired: {
            type: "boolean",
            description:
              "true kada korisnik pita i za već istekle rokove; inače false.",
          },
        },
        required: ["days", "client_name", "include_expired"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: "Neispravni argumenti za getUpcomingDeadlines." };
    }

    const client = await resolveClientArg(ctx, parsed.data.client_name);
    if (client.kind === "halt") return client.outcome;

    const result = await listUpcomingComplianceDeadlines(ctx.supabase, {
      agencyId: ctx.agencyId,
      clientIds: ctx.clientIds,
      days: parsed.data.days,
      clientCompanyId: client.kind === "one" ? client.client.id : null,
      includeExpired: parsed.data.include_expired,
      todayIso: ctx.todayIso,
    });

    if (!result.ok) return { ok: false, error: result.message };

    const { deadlines, truncated } = result.value;

    return {
      ok: true,
      data: {
        status: deadlines.length === 0 ? "empty" : "ok",
        days: parsed.data.days,
        client: client.kind === "one" ? client.client.name : null,
        include_expired: parsed.data.include_expired,
        count: deadlines.length,
        truncated,
        deadlines: deadlines.map((d) => ({
          client: d.client_name,
          subject: d.subject_name,
          category: d.category,
          record_type: d.record_type,
          expiry_date: d.expiry_date,
          days_remaining: d.days_remaining,
          status: d.status,
        })),
      },
    };
  },
};
