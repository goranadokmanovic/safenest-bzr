import { jsonError } from "@/lib/api/responses";

const DEFAULT_MAX = 512 * 1024;

/**
 * Čita telo kao tekst sa limitom veličine (zaštita od velikog JSON-a).
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  const rawLen = request.headers.get("content-length");
  if (rawLen) {
    const n = Number(rawLen);
    if (Number.isFinite(n) && n > maxBytes) {
      return {
        ok: false,
        response: jsonError("Telo zahteva je preveliko.", 413, {
          code: "PAYLOAD_TOO_LARGE",
        }),
      };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonError("Ne mogu da pročitam telo zahteva.", 400, {
        code: "BODY_READ_ERROR",
      }),
    };
  }

  if (text.length > maxBytes) {
    return {
      ok: false,
      response: jsonError("Telo zahteva je preveliko.", 413, {
        code: "PAYLOAD_TOO_LARGE",
      }),
    };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonError("Neispravan JSON.", 400, { code: "INVALID_JSON" }),
    };
  }
}
