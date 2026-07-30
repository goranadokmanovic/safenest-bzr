import { z } from "zod";
import { getClientSummary as loadClientSummary } from "@/lib/queries/clients";
import { resolveClientArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().min(1),
});

export const getClientSummary: AgentTool = {
  name: "getClientSummary",
  definition: {
    type: "function",
    function: {
      name: "getClientSummary",
      description:
        "Pregled jednog klijenta: broj radnika, broj terenskih poseta, datum poslednje posete i status compliance rokova (istekli, ističu u 30 dana, bez datuma isteka). Koristi kada korisnik traži sažetak ili stanje kod nekog klijenta.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: "string",
            description: "Naziv klijenta, onako kako ga je korisnik izgovorio.",
          },
        },
        required: ["client_name"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: "Neispravni argumenti za getClientSummary." };
    }

    const client = await resolveClientArg(ctx, parsed.data.client_name);
    if (client.kind === "halt") return client.outcome;
    if (client.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za pregled je potreban konkretan klijent. Pitaj korisnika o kom klijentu je reč.",
        },
      };
    }

    const summary = await loadClientSummary(
      ctx.supabase,
      client.client,
      ctx.todayIso,
    );
    if (!summary.ok) return { ok: false, error: summary.message };

    return { ok: true, data: { status: "ok", ...summary.value } };
  },
};
