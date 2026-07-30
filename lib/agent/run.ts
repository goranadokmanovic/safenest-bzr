import { callChatWithTools } from "@/lib/agent/llm";
import { findTool, TOOL_DEFINITIONS } from "@/lib/agent/registry";
import {
  AgentError,
  type AgentMessage,
  type ChatMessage,
  type ToolContext,
  type ToolTrace,
} from "@/lib/agent/types";

/**
 * Koliko puta model sme da pozove alat pre nego što ga nateramo na odgovor.
 * Faza A pitanja se rešavaju u jednom, najviše dva poziva; limit je zaštita od
 * petlje koja troši tokene.
 */
const MAX_TOOL_ROUNDS = 4;

/** Gornja granica dužine JSON-a jednog tool rezultata koji ide u kontekst. */
const MAX_TOOL_RESULT_CHARS = 12_000;

export type AgentTurnResult = {
  reply: string;
  toolTrace: ToolTrace[];
};

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeForModel(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return JSON.stringify({
    error:
      "Rezultat je prevelik za prikaz. Suzi upit (kraći period ili konkretan klijent).",
  });
}

/**
 * Jedan potez razgovora: model → (alat → model)* → tekstualni odgovor.
 *
 * Svi alati dobijaju isti `ctx`, koji nosi Supabase klijent ulogovanog
 * korisnika. Model ne vidi ni agency_id ni bilo koji UUID iz konteksta i ne
 * može da ih postavi kroz argumente.
 */
export async function runAgentTurn(
  ctx: ToolContext,
  systemPrompt: string,
  history: AgentMessage[],
): Promise<AgentTurnResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) =>
      m.role === "user"
        ? ({ role: "user", content: m.content } as const)
        : ({ role: "assistant", content: m.content } as const),
    ),
  ];

  const toolTrace: ToolTrace[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const lastRound = round === MAX_TOOL_ROUNDS;

    const completion = await callChatWithTools({
      messages,
      // U poslednjem krugu sklanjamo alate da bi model morao da odgovori tekstom.
      tools: lastRound ? [] : TOOL_DEFINITIONS,
    });

    if (completion.toolCalls.length === 0) {
      const reply = completion.content?.trim();
      if (!reply) {
        throw new AgentError(
          "Asistent nije vratio odgovor. Pokušaj ponovo.",
          502,
          "EMPTY_COMPLETION",
        );
      }
      return { reply, toolTrace };
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      tool_calls: completion.toolCalls,
    });

    for (const call of completion.toolCalls) {
      const tool = findTool(call.function.name);
      const args = parseToolArguments(call.function.arguments);

      if (!tool) {
        toolTrace.push({
          name: call.function.name,
          arguments: args,
          ok: false,
          error: "Nepoznat alat.",
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Nepoznat alat." }),
        });
        continue;
      }

      let outcome;
      try {
        outcome = await tool.run(ctx, args);
      } catch (e) {
        console.error("[agent] tool", tool.name, e);
        outcome = {
          ok: false as const,
          error: "Alat je pukao pri izvršavanju.",
        };
      }

      toolTrace.push(
        outcome.ok
          ? { name: tool.name, arguments: args, ok: true, data: outcome.data }
          : { name: tool.name, arguments: args, ok: false, error: outcome.error },
      );

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: outcome.ok
          ? serializeForModel(outcome.data)
          : JSON.stringify({ error: outcome.error }),
      });
    }
  }

  throw new AgentError(
    "Asistent nije uspeo da završi odgovor.",
    502,
    "TOOL_LOOP_EXHAUSTED",
  );
}
