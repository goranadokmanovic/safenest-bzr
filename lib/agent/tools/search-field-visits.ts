import { z } from "zod";
import { isSuperAdmin } from "@/lib/api/session";
import { searchFieldVisits as runSemanticSearch } from "@/lib/search/field-visits";
import { resolveClientArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  query: z.string().min(2).max(1000),
  client_name: z.string().nullable(),
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
        "Semantička pretraga terenskih poseta po sadržaju napomena, zapisnika i OCR teksta sa fotografija. Koristi kada korisnik traži posete po temi ili opisu (npr. problemi sa protivpožarnom opremom, rad na visini), a ne po tačnim brojkama. Ako je pitanje vezano za konkretnog klijenta, njegov naziv ide u client_name, a ne samo u query.",
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
          client_name: {
            type: ["string", "null"],
            description:
              "Naziv klijenta ako ga korisnik pominje u pitanju, prepisan onako kako ga je napisao. OBAVEZNO ga popuni kad god je u pitanju imenovan klijent — bez toga pretraga vraća posete drugih klijenata i odgovor je pogrešan. null samo kada pitanje nije vezano ni za jednog konkretnog klijenta.",
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
        required: ["query", "client_name", "risk_level", "limit"],
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

    // Ime klijenta ide kroz isto razrešavanje kao kod ostalih alata: ako je van
    // opsega saradnika, potez se ovde prekida fiksnom porukom. Bez toga bi ime
    // završilo samo kao tekst u embedding-u, pa bi pretraga vratila semantički
    // najbliže posete — tuđe — i odgovor bi delovao kao da je klijent proveren.
    const clientArg = await resolveClientArg(ctx, parsed.data.client_name);
    if (clientArg.kind === "halt") return clientArg.outcome;
    const client = clientArg.kind === "one" ? clientArg.client : null;

    const agencyId = isSuperAdmin(ctx.profile) ? null : ctx.agencyId;
    const scopeIds = client ? [client.id] : ctx.clientIds;

    const outcome = await runSemanticSearch(
      ctx.supabase,
      agencyId,
      {
        query: parsed.data.query,
        limit: parsed.data.limit,
        riskLevel: parsed.data.risk_level ?? undefined,
      },
      scopeIds,
    );

    if (!outcome.ok) return { ok: false, error: outcome.message };

    return {
      ok: true,
      data: {
        status: outcome.results.length === 0 ? "empty" : "ok",
        query: parsed.data.query,
        client: client?.name ?? null,
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
