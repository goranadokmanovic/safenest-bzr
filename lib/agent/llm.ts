/**
 * Tanak sloj ka OpenAI Chat Completions API-ju sa function calling-om.
 *
 * Namerno bez SDK-a — ostatak projekta (embeddings, transkripcija, generisanje
 * zapisnika) zove OpenAI istim `fetch` obrascem. Ako se provider ikada menja,
 * ovo je jedini fajl koji se prepisuje.
 */

import {
  AgentError,
  type ChatMessage,
  type OpenAiToolCall,
  type OpenAiToolDefinition,
} from "@/lib/agent/types";

const DEFAULT_MODEL = "gpt-4o";
const REQUEST_TIMEOUT_MS = 90_000;

export function agentModel(): string {
  return process.env.OPENAI_AGENT_MODEL?.trim() || DEFAULT_MODEL;
}

export type ChatCompletion = {
  content: string | null;
  toolCalls: OpenAiToolCall[];
  finishReason: string | null;
};

export async function callChatWithTools(input: {
  messages: ChatMessage[];
  tools: OpenAiToolDefinition[];
  temperature?: number;
}): Promise<ChatCompletion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AgentError(
      "OPENAI_API_KEY nije podešen na serveru.",
      500,
      "CONFIG_ERROR",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: agentModel(),
        temperature: input.temperature ?? 0.2,
        messages: input.messages,
        tools: input.tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "TimeoutError";
    throw new AgentError(
      aborted
        ? "Asistent nije odgovorio na vreme. Pokušaj ponovo."
        : "Ne mogu da dođem do OpenAI servisa.",
      504,
      "UPSTREAM_TIMEOUT",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AgentError(
      `OpenAI poziv nije uspeo (${response.status}): ${body.slice(0, 300)}`,
      502,
      "UPSTREAM_ERROR",
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | null;
        tool_calls?: OpenAiToolCall[];
      };
    }>;
  };

  const choice = json.choices?.[0];
  if (!choice?.message) {
    throw new AgentError("Neočekivan odgovor od OpenAI.", 502, "UPSTREAM_ERROR");
  }

  return {
    content: choice.message.content ?? null,
    toolCalls: choice.message.tool_calls ?? [],
    finishReason: choice.finish_reason ?? null,
  };
}
