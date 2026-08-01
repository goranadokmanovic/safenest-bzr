import { z } from "zod";
import { listScopedClientsWithStats } from "@/lib/queries/clients";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().nullable(),
});

/**
 * Lista klijenata u opsegu trenutnog korisnika.
 * Za „zadužen” — assigned_count (assigned_collaborator_id); širi opseg
 * (posete) je u count / visit_only_count.
 */
export const getMyAssignedClients: AgentTool = {
  name: "getMyAssignedClients",
  definition: {
    type: "function",
    function: {
      name: "getMyAssignedClients",
      description:
        "Lista i broj klijenata u opsegu ulogovanog korisnika. Koristi za pitanja: „za koliko klijenata sam zadužen”, „koji su moji klijenti”, „koliko klijenata imam”. Za „zadužen” gledaj assigned_count (stroga dodela). Owner vidi celu agenciju (count). Opciono filtriraj po client_name.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: ["string", "null"],
            description:
              "Opciona pretraga po nazivu klijenta. null = svi u opsegu.",
          },
        },
        required: ["client_name"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Neispravni argumenti za getMyAssignedClients.",
      };
    }

    const result = await listScopedClientsWithStats(ctx.supabase, {
      agencyId: ctx.agencyId,
      clientIds: ctx.clientIds,
      userId: ctx.profile.user_id,
      clientName: parsed.data.client_name,
      todayIso: ctx.todayIso,
      limit: 100,
    });

    if (!result.ok) return { ok: false, error: result.message };

    const value = result.value;
    if (value.count === 0) {
      return {
        ok: true,
        data: {
          status: "empty",
          scope: value.scope,
          count: 0,
          assigned_count: 0,
          visit_only_count: 0,
          searched_for: parsed.data.client_name,
          hint:
            parsed.data.client_name?.trim()
              ? "Nijedan klijent u opsegu ne odgovara tom nazivu."
              : "Nema klijenata u opsegu korisnika.",
        },
      };
    }

    return {
      ok: true,
      data: {
        status: "ok",
        scope: value.scope,
        count: value.count,
        assigned_count: value.assigned_count,
        visit_only_count: value.visit_only_count,
        truncated: value.truncated,
        hint: value.hint,
        clients: value.clients.map((c) => ({
          name: c.name,
          is_assigned: c.is_assigned,
          employees_active: c.employees_active,
          compliance_expired: c.compliance_expired,
          compliance_expiring_30d: c.compliance_expiring_30d,
        })),
      },
    };
  },
};
