/**
 * Zaseban, stroži limit za asistenta. Opšti limiter u middleware-u dozvoljava
 * 120 zahteva/min po IP-u, što je previše za rutu koja svakim pozivom troši
 * OpenAI tokene. Ključ je user_id, ne IP — cilj je kontrola troška po nalogu.
 *
 * Isto ograničenje kao i opšti limiter: brojač je po instanci procesa, pa na
 * više serverless instanci nije globalno tačan. Dovoljno protiv slučajnog
 * spama, nije zamena za pravi kvota-sistem.
 */

const WINDOW_MS = 5 * 60_000;
const MAX_REQUESTS = 15;

type Bucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __safenestAgentRateLimit: Map<string, Bucket> | undefined;
}

function getStore(): Map<string, Bucket> {
  const g = globalThis as typeof globalThis & {
    __safenestAgentRateLimit?: Map<string, Bucket>;
  };
  if (!g.__safenestAgentRateLimit) {
    g.__safenestAgentRateLimit = new Map();
  }
  return g.__safenestAgentRateLimit;
}

export type AgentRateLimit = { allowed: true } | { allowed: false; retryAfter: number };

export function checkAgentRateLimit(userId: string): AgentRateLimit {
  const now = Date.now();
  const store = getStore();
  const bucket = store.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true };
}
