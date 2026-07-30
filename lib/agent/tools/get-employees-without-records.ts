import { z } from "zod";
import { listEmployeesWithoutComplianceRecords } from "@/lib/queries/compliance";
import { resolveClientArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";

const argsSchema = z.object({
  client_name: z.string().nullable(),
  record_type: z
    .enum(["medical_exam", "training_certification", "equipment_check"])
    .nullable(),
});

export const getEmployeesWithoutComplianceRecords: AgentTool = {
  name: "getEmployeesWithoutComplianceRecords",
  definition: {
    type: "function",
    function: {
      name: "getEmployeesWithoutComplianceRecords",
      description:
        "Radnici klijenta koji nemaju nijedan unet compliance zapis. Koristi kada korisnik pita ko nema lekarski pregled, ko nije obučen ili za koga nedostaju zapisi. VAŽNO: ovde 'radnik' znači zaposleni kod klijenta, ne član agencije.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: ["string", "null"],
            description:
              "Naziv klijenta. null = svi klijenti u opsegu korisnika.",
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
              "Ograniči na radnike bez zapisa baš tog tipa. null = bez ijednog zapisa bilo kog tipa.",
          },
        },
        required: ["client_name", "record_type"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Neispravni argumenti za getEmployeesWithoutComplianceRecords.",
      };
    }

    const client = await resolveClientArg(ctx, parsed.data.client_name);
    if (client.kind === "halt") return client.outcome;

    const result = await listEmployeesWithoutComplianceRecords(ctx.supabase, {
      agencyId: ctx.agencyId,
      clientIds: ctx.clientIds,
      clientCompanyId: client.kind === "one" ? client.client.id : null,
      recordType: parsed.data.record_type,
    });

    if (!result.ok) return { ok: false, error: result.message };

    const { employees, checked_employees, truncated } = result.value;

    return {
      ok: true,
      data: {
        status: employees.length === 0 ? "empty" : "ok",
        client: client.kind === "one" ? client.client.name : null,
        record_type: parsed.data.record_type,
        checked_employees,
        count: employees.length,
        truncated,
        employees: employees.map((e) => ({
          full_name: e.full_name,
          position: e.position,
          client: e.client_name,
        })),
      },
    };
  },
};
