import { NextResponse } from "next/server";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const GET = withApiCatch(async () => {
  return NextResponse.json({
    ok: true,
    app: "safenest-bzr",
    timestamp: new Date().toISOString(),
  });
});
