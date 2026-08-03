import { z } from "zod";
import { generateMonthlyReportNarrative } from "@/lib/agent/monthly-report-narrative";
import { resolveClientArg } from "@/lib/agent/tools/shared";
import type { AgentTool, ToolContext, ToolOutcome } from "@/lib/agent/types";
import { getClientMonthlyReportData } from "@/lib/queries/client-monthly-report";
import { resolvePeriod } from "@/lib/queries/field-visits";

const argsSchema = z.object({
  client_name: z.string().min(1),
  year: z.number().int().nullable(),
  month: z.number().int(),
});

export const generateClientMonthlyReport: AgentTool = {
  name: "generateClientMonthlyReport",
  definition: {
    type: "function",
    function: {
      name: "generateClientMonthlyReport",
      description:
        "Mesečni sažetak za jednog klijenta: broj i rizik terenskih poseta u mesecu, compliance zapisi čiji expiry_date pada u taj mesec, i kratak AI narativ. Koristi kada korisnik traži mesečni izveštaj / monthly report za imenovanog klijenta (npr. „izveštaj za Safe For All za jul”). Ne koristi za opšti pregled klijenta (tu je getClientSummary) ni za brojanje poseta po članu agencije.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          client_name: {
            type: "string",
            description: "Naziv klijenta, onako kako ga je korisnik izgovorio.",
          },
          year: {
            type: ["integer", "null"],
            description: "Godina. null = tekuća godina.",
          },
          month: {
            type: "integer",
            description: "Mesec 1-12.",
          },
        },
        required: ["client_name", "year", "month"],
      },
    },
  },

  async run(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Neispravni argumenti za generateClientMonthlyReport.",
      };
    }

    if (
      !Number.isInteger(parsed.data.month) ||
      parsed.data.month < 1 ||
      parsed.data.month > 12
    ) {
      return { ok: false, error: "Mesec mora biti broj od 1 do 12." };
    }

    const period = resolvePeriod(
      {
        period_type: "month",
        year: parsed.data.year,
        month: parsed.data.month,
      },
      ctx.todayIso,
      ctx.locale,
    );
    if (!period.ok) return { ok: false, error: period.message };

    const client = await resolveClientArg(ctx, parsed.data.client_name);
    if (client.kind === "halt") return client.outcome;
    if (client.kind === "all") {
      return {
        ok: true,
        data: {
          status: "needs_clarification",
          hint: "Za mesečni izveštaj je potreban konkretan klijent. Pitaj korisnika o kom klijentu je reč.",
        },
      };
    }

    const report = await getClientMonthlyReportData(ctx.supabase, {
      agencyId: ctx.agencyId,
      client: client.client,
      period: period.value,
      todayIso: ctx.todayIso,
    });
    if (!report.ok) return { ok: false, error: report.message };

    const structured = {
      client: {
        id: report.value.client.id,
        name: report.value.client.name,
      },
      period: {
        label: report.value.period.label,
        from: report.value.period.from,
        to: report.value.period.to,
      },
      visits: {
        total: report.value.visits.total,
        by_status: report.value.visits.by_status,
        by_risk: report.value.visits.by_risk,
        risk_trend: report.value.visits.risk_trend,
        rows: report.value.visits.rows,
        truncated: report.value.visits.truncated,
      },
      compliance: {
        expired_in_period: report.value.compliance.expired_in_period,
        expiring_in_period: report.value.compliance.expiring_in_period,
        items: report.value.compliance.items,
        truncated: report.value.compliance.truncated,
      },
    };

    const narrative = await generateMonthlyReportNarrative(
      structured,
      ctx.locale,
    );

    return {
      ok: true,
      data: {
        status: "ok",
        ...structured,
        narrative,
        narrative_locale: ctx.locale,
      },
    };
  },
};
