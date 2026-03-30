import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { apiRateLimitResponse } from "@/lib/rate-limit/middleware";

export async function middleware(request: NextRequest) {
  const limited = apiRateLimitResponse(request);
  if (limited) return limited;
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
