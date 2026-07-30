import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

type Bucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __safenestApiRateLimit: Map<string, Bucket> | undefined;
}

function getStore(): Map<string, Bucket> {
  const g = globalThis as typeof globalThis & {
    __safenestApiRateLimit?: Map<string, Bucket>;
  };
  if (!g.__safenestApiRateLimit) {
    g.__safenestApiRateLimit = new Map();
  }
  return g.__safenestApiRateLimit;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return ip;
}

/**
 * Jednostavan prozor po IP-u (prikladno za dev i jedan Node proces).
 * Na Vercelu edge izolati — granula nije globalna između svih instanci.
 */
export function apiRateLimitResponse(
  request: NextRequest,
): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/")) return null;
  if (path === "/api/health") return null;
  if (path === "/api/stripe/webhook") return null;

  const key = clientKey(request);
  const now = Date.now();
  const store = getStore();
  let bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, bucket);
    return null;
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    const retrySec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      {
        error: "Previše zahteva. Sačekaj malo pa pokušaj ponovo.",
        code: "RATE_LIMITED",
        retryAfter: retrySec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retrySec) },
      },
    );
  }

  return null;
}
