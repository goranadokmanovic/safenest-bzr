import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProfile } from "@/lib/api/session";
import type { PendingAction } from "@/lib/agent/pending-action";

export type { PendingAction };

/** Poruka kakvu razmenjuju UI i /api/assistant/chat. */
export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** Interni oblik poruka koji ide ka OpenAI Chat Completions API-ju. */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type JsonSchema = Record<string, unknown>;

export type OpenAiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    strict?: boolean;
    parameters: JsonSchema;
  };
};

/**
 * Kontekst koji svaki alat dobija. `supabase` je UVEK klijent vezan za sesiju
 * korisnika (cookie / anon ključ), nikad service role — RLS je jedina prava
 * granica pristupa i alati je ne smeju zaobići.
 */
export type ToolContext = {
  supabase: SupabaseClient;
  profile: AuthProfile;
  agencyId: string;
  /** Opseg klijenata iz lib/api/client-scope.ts; null = bez sužavanja. */
  clientIds: string[] | null;
  /** Današnji datum u Europe/Belgrade (YYYY-MM-DD). */
  todayIso: string;
};

export type ToolOutcome =
  | {
      ok: true;
      data: unknown;
      /**
       * Kada je postavljen, ovaj tekst ide korisniku doslovno i potez se
       * prekida — model ga ne preformuliše. Za slučajeve gde formulacija mora
       * biti ista svaki put (v. lib/agent/fixed-replies.ts).
       */
      finalReply?: string;
      /**
       * Write predlog (Faza B). Server ga ne izvršava — ide klijentu kao
       * `pending_action` za ActionConfirmCard. Ne ubacuj ID-jeve u `data`
       * koji ide modelu; drži ih samo ovde.
       */
      pendingAction?: PendingAction;
    }
  | { ok: false; error: string };

export type AgentTool = {
  name: string;
  definition: OpenAiToolDefinition;
  run: (ctx: ToolContext, args: unknown) => Promise<ToolOutcome>;
};

/** Trag izvršenih alata — UI ga prikazuje ispod odgovora. */
export type ToolTrace = {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  data?: unknown;
  error?: string;
};

export class AgentError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "AGENT_ERROR") {
    super(message);
    this.name = "AgentError";
    this.status = status;
    this.code = code;
  }
}
