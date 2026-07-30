import type { NextResponse } from "next/server";
import {
  getAuthContext,
  canMutateAgencyRecords,
  canMutateFieldRecords,
  isClientPortalUser,
  type AuthContext,
} from "@/lib/api/session";
import { requireSubscriptionForMutation } from "@/lib/plans/feature-gate";
import { jsonError } from "@/lib/api/responses";

export async function getMutationContext(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }
> {
  const auth = await getAuthContext();
  if (!auth.ok) return auth;

  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return {
      ok: false,
      response: jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  if (!canMutateAgencyRecords(profile)) {
    return {
      ok: false,
      response: jsonError("Nemate dozvolu za izmenu.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  const sub = await requireSubscriptionForMutation(supabase, profile);
  if (!sub.ok) return sub;

  return { ok: true, ctx: auth.ctx };
}

/** Terenski modul — uključuje field_worker. */
export async function getFieldMutationContext(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }
> {
  const auth = await getAuthContext();
  if (!auth.ok) return auth;

  const { profile, supabase } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return {
      ok: false,
      response: jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  if (!canMutateFieldRecords(profile)) {
    return {
      ok: false,
      response: jsonError("Nemate dozvolu za terenske operacije.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  const sub = await requireSubscriptionForMutation(supabase, profile);
  if (!sub.ok) return sub;

  return { ok: true, ctx: auth.ctx };
}
