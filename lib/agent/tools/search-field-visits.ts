import { z } from "zod";
import { isSuperAdmin } from "@/lib/api/session";
import { searchFieldVisits as runSemanticSearch } from "@/lib/search/field-visits";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  query: z.string().min(2).max(1000),
  risk_level: z.enum(["low", "medium", "high"]).nullable(),
  limit: z.number().int().min(1).max(30),
});

export const searchFieldVisits: AgentTool = {
  name: "searchFieldVisits",
  definition: {
    type: "function",
    function: {
      name: "searchFieldVisits",
      description:
        "Semantička pretraga terenskih poseta po sadržaju napomena, zapisnika i OCR teksta sa fotografija. Koristi kada korisnik traži posete po temi ili opisu (npr. problemi sa protivpožarnom opremom, rad na visini), a ne po tačnim brojkama.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description:
              "Opis onoga što se traži, prirodnim jezikom. Prenesi korisnikovu formulaciju, ne skraćuj je na ključne reči.",
          },
          risk_level: {
            type: ["string", "null"],
            enum: ["low", "medium", "high", null],
            description:
              "Filter nivoa rizika. null = bez filtera (sistem sam prepoznaje rizik iz teksta upita).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 30,
            description: "Maksimalan broj rezultata. Koristi 10 kao podrazumevano.",
          },
        },
        required: ["query", "risk_level", "limit"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Upit za pretragu mora imati bar 2 karaktera.",
      };
    }

    const agencyId = isSuperAdmin(ctx.profile) ? null : ctx.agencyId;

    const outcome = await runSemanticSearch(ctx.supabase, agencyId, {
      query: parsed.data.query,
      limit: parsed.data.limit,
      riskLevel: parsed.data.risk_level ?? undefined,
    });

    if (!outcome.ok) return { ok: false, error: outcome.message };

    return {
      ok: true,
      data: {
        status: outcome.results.length === 0 ? "empty" : "ok",
        query: parsed.data.query,
        detected_risk_level: outcome.detectedRiskLevel,
        count: outcome.results.length,
        visits: outcome.results.map((r) => ({
          visit_id: r.id,
          client: r.client_name,
          scheduled_at: r.scheduled_at,
          status: r.status,
          notes: r.notes ? r.notes.slice(0, 400) : null,
          similarity: Math.round(r.similarity * 100) / 100,
        })),
      },
    };
  },
};
