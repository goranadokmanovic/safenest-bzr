import { jsonError } from "@/lib/api/responses";

type Handler<A extends unknown[]> = (...args: A) => Promise<Response>;

export function withApiCatch<A extends unknown[]>(handler: Handler<A>): Handler<A> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      console.error("[api]", e);
      return jsonError("Interna greška servera.", 500, {
        code: "INTERNAL_ERROR",
      });
    }
  };
}
