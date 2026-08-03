import { z } from "zod";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isClientPortalUser, isSuperAdmin } from "@/lib/api/session";
import { clientIdsInScope, isScopedCollaborator } from "@/lib/api/client-scope";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { todayBelgradeIso } from "@/lib/compliance/types";
import { checkAgentRateLimit } from "@/lib/agent/rate-limit";
import { runAgentTurn } from "@/lib/agent/run";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { AgentError, type ToolContext } from "@/lib/agent/types";

export const maxDuration = 120;

/** Istorija se šalje cela sa klijenta; limit drži trošak tokena pod kontrolom. */
const MAX_HISTORY_MESSAGES = 20;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(MAX_HISTORY_MESSAGES),
  locale: z.enum(["sr", "en"]).optional().default("sr"),
});

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  const agencyId = profile.agency_id;
  if (!agencyId) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }
  if (isSuperAdmin(profile)) {
    return jsonError(
      "Asistent radi u kontekstu jedne agencije. Prijavi se kao član agencije.",
      403,
      { code: "FORBIDDEN" },
    );
  }

  const limit = checkAgentRateLimit(user.id);
  if (!limit.allowed) {
    return jsonError(
      "Previše pitanja u kratkom roku. Sačekaj malo pa pokušaj ponovo.",
      429,
      { code: "RATE_LIMITED", retryAfter: limit.retryAfter },
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const lastMessage = parsed.data.messages[parsed.data.messages.length - 1];
  if (lastMessage?.role !== "user") {
    return jsonError("Poslednja poruka mora biti korisnikova.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const visible = await clientIdsInScope(supabase, profile);
  if (!visible.ok) {
    return jsonError(visible.message, 400, { code: "DATABASE_ERROR" });
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .maybeSingle();

  const todayIso = todayBelgradeIso();

  const ctx: ToolContext = {
    supabase,
    profile,
    agencyId,
    clientIds: visible.clientIds,
    todayIso,
    locale: parsed.data.locale,
  };

  const systemPrompt = buildSystemPrompt({
    profile,
    agencyName: (agency?.name as string | null) ?? null,
    todayIso,
    scopedToAssignedClients: isScopedCollaborator(profile),
    locale: parsed.data.locale,
  });

  try {
    const result = await runAgentTurn(ctx, systemPrompt, parsed.data.messages);
    return jsonOk({
      reply: result.reply,
      toolTrace: result.toolTrace,
      pending_action: result.pendingAction,
    });
  } catch (e) {
    if (e instanceof AgentError) {
      return jsonError(e.message, e.status, { code: e.code });
    }
    throw e;
  }
});
