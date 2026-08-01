import { z } from "zod";
import { listScopedClientsWithStats } from "@/lib/queries/clients";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().nullable(),
});

function isCollaboratorAudience(ctx: ToolContext): boolean {
  return ctx.profile.role === "agency_collaborator";
}

/**
 * Lista klijenata vidljivih trenutnom korisniku.
 * Owner / širi view: prirodan broj klijenata agencije.
 * Saradnik: assigned vs dodatno vidljivo preko poseta.
 */
export const getMyAssignedClients: AgentTool = {
  name: "getMyAssignedClients",
  definition: {
    type: "function",
    function: {
      name: "getMyAssignedClients",
      description:
        "Lista i broj klijenata vidljivih ulogovanom korisniku. Koristi za: „za koliko klijenata sam zadužen”, „koji su moji klijenti”, „koliko klijenata imam”. Za vlasnika vraća broj klijenata agencije; za saradnika razlikuje strogu dodelu i klijente vidljive preko poseta. Opciono filtriraj po client_name.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: ["string", "null"],
            description:
              "Opciona pretraga po nazivu klijenta. null = svi vidljivi klijenti.",
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
    const collaborator = isCollaboratorAudience(ctx);
    const searched = parsed.data.client_name;

    if (!collaborator) {
      if (value.count === 0) {
        return {
          ok: true,
          data: {
            status: "empty",
            audience: "agency_owner",
            client_count: 0,
            searched_for: searched,
            hint: searched?.trim()
              ? "Nijedan klijent agencije ne odgovara tom nazivu. Formuliši prirodno — ne pominji zaduženje ni opseg."
              : "Agencija trenutno nema klijenata. Formuliši prirodno — ne pominji zaduženje ni opseg.",
          },
        };
      }

      return {
        ok: true,
        data: {
          status: "ok",
          audience: "agency_owner",
          client_count: value.count,
          truncated: value.truncated,
          searched_for: searched,
          hint:
            "Korisnik je vlasnik (ili vidi celu agenciju). Odgovori prirodno: npr. „Tvoja agencija ima N klijenata” / „Vodite N klijenata”. Koristi client_count. NIKADA ne pominji zadužen, opseg, assigned niti razliku assigned/visit.",
          clients: value.clients.map((c) => ({
            name: c.name,
            employees_active: c.employees_active,
            compliance_expired: c.compliance_expired,
            compliance_expiring_30d: c.compliance_expiring_30d,
          })),
        },
      };
    }

    // Saradnik — stroga dodela vs vidljivo preko poseta.
    if (value.count === 0) {
      return {
        ok: true,
        data: {
          status: "empty",
          audience: "agency_collaborator",
          count: 0,
          assigned_count: 0,
          visit_only_count: 0,
          searched_for: searched,
          hint: searched?.trim()
            ? "Nijedan tvoj vidljivi klijent ne odgovara tom nazivu."
            : "Nemaš dodeljenih ni preko poseta vidljivih klijenata.",
        },
      };
    }

    return {
      ok: true,
      data: {
        status: "ok",
        audience: "agency_collaborator",
        count: value.count,
        assigned_count: value.assigned_count,
        visit_only_count: value.visit_only_count,
        truncated: value.truncated,
        searched_for: searched,
        hint:
          value.visit_only_count > 0
            ? "Za „zadužen” koristi assigned_count (stroga dodela). Ako je relevantno, dodaj da još visit_only_count klijenata vidiš preko poseta — ne mešaj ta dva broja. Ne koristi reč „opseg” u odgovoru korisniku."
            : "Za „zadužen” / „moji klijenti” koristi assigned_count. Ne koristi reč „opseg” u odgovoru korisniku.",
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
