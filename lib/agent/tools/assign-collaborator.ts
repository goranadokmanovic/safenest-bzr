import { z } from "zod";
import {
  PENDING_CONFIRMATION_HINT,
  resolveClientArg,
  resolveCollaboratorArg,
} from "@/lib/agent/tools/shared";
import { listAgencyCollaborators } from "@/lib/field-visits/list";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().min(1),
  collaborator_name: z.string().min(1),
});

/**
 * Faza B — samo predlog, i samo za agency_owner.
 * Upis ide kroz PATCH /api/clients/[id] sa assigned_collaborator_id.
 */
export const assignCollaboratorToClient: AgentTool = {
  name: "assignCollaboratorToClient",
  definition: {
    type: "function",
    function: {
      name: "assignCollaboratorToClient",
      description:
        "Predlaže dodelu saradnika (agency_collaborator) klijentu. Samo vlasnik agencije sme ovo. Ne menja ništa sama — priprema predlog za potvrdu.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: "string",
            description: "Naziv klijenta.",
          },
          collaborator_name: {
            type: "string",
            description: "Ime saradnika koji se dodeljuje klijentu.",
          },
        },
        required: ["client_name", "collaborator_name"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    if (ctx.profile.role !== "agency_owner") {
      return {
        ok: true,
        data: {
          status: "forbidden",
          hint: "Samo vlasnik agencije može da dodeljuje saradnike klijentima. Uputi korisnika da se obrati vlasniku.",
        },
      };
    }

    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Neispravni argumenti za assignCollaboratorToClient.",
      };
    }

    const clientArg = await resolveClientArg(ctx, parsed.data.client_name);
    if (clientArg.kind === "halt") return clientArg.outcome;
    if (clientArg.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za dodelu je potreban konkretan klijent. Pitaj korisnika o kom klijentu je reč.",
        },
      };
    }

    const collabArg = await resolveCollaboratorArg(
      ctx,
      parsed.data.collaborator_name,
    );
    if (collabArg.kind === "halt") return collabArg.outcome;
    if (collabArg.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za dodelu je potreban konkretan saradnik. Pitaj korisnika koga da dodeli.",
        },
      };
    }

    const { data: clientRow, error } = await ctx.supabase
      .from("client_companies")
      .select("id, name, assigned_collaborator_id")
      .eq("id", clientArg.client.id)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!clientRow) {
      return {
        ok: true,
        data: {
          status: "client_not_found",
          searched_for: parsed.data.client_name,
        },
      };
    }

    let previousName: string | null = null;
    const previousId = clientRow.assigned_collaborator_id as string | null;
    if (previousId) {
      if (previousId === collabArg.worker.user_id) {
        return {
          ok: true,
          data: {
            status: "already_assigned",
            client: clientArg.client.name,
            collaborator: collabArg.worker.full_name,
            hint: "Taj saradnik je već dodeljen ovom klijentu. Reci korisniku da nema šta da se menja.",
          },
        };
      }
      const collaborators = await listAgencyCollaborators(
        ctx.supabase,
        ctx.agencyId,
      );
      previousName =
        collaborators.find((c) => c.user_id === previousId)?.full_name ?? null;
    }

    const summary = previousName
      ? `Dodela saradnika: ${clientArg.client.name} — ${previousName} → ${collabArg.worker.full_name}`
      : `Dodela saradnika: ${clientArg.client.name} → ${collabArg.worker.full_name}`;

    return {
      ok: true,
      data: {
        status: "pending_confirmation",
        summary,
        display: {
          client_name: clientArg.client.name,
          collaborator_name: collabArg.worker.full_name,
          previous_collaborator_name: previousName,
        },
        hint: PENDING_CONFIRMATION_HINT,
      },
      pendingAction: {
        kind: "assignCollaboratorToClient",
        summary,
        display: {
          client_name: clientArg.client.name,
          collaborator_name: collabArg.worker.full_name,
          previous_collaborator_name: previousName,
        },
        execute: {
          method: "PATCH",
          path: `/api/clients/${clientArg.client.id}`,
          body: {
            assigned_collaborator_id: collabArg.worker.user_id,
          },
        },
      },
    };
  },
};
