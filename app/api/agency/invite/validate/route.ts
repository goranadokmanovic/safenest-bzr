import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { resolveInviteStatus } from "@/lib/api/invite-code";

type InviteLookupRow = {
  id: string;
  agency_id: string;
  email: string | null;
  role: string;
  expires_at: string;
  used_at: string | null;
  agency_name: string | null;
};

async function lookupInviteByCode(
  code: string,
): Promise<
  | { ok: true; invite: InviteLookupRow }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 1) SECURITY DEFINER RPC (radi i bez service role / mimo RLS)
  if (url && anon) {
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("get_agency_invite_by_code", {
      p_code: code,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        return { ok: true, invite: row as InviteLookupRow };
      }
      return {
        ok: false,
        response: jsonError("Pozivnica nije pronađena.", 404, {
          code: "INVITE_NOT_FOUND",
        }),
      };
    }
    // RPC nije primenjen u bazi — fallback na admin
    console.warn(
      "[invite-validate] RPC get_agency_invite_by_code failed:",
      error.message,
    );
  }

  // 2) Fallback: service role (bypass RLS)
  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return {
      ok: false,
      response: jsonError(
        "Server nije konfigurisan (RPC ili SUPABASE_SERVICE_ROLE_KEY).",
        503,
        { code: "CONFIG_ERROR" },
      ),
    };
  }

  const { data: invite, error } = await admin
    .from("agency_invites")
    .select("id, agency_id, email, role, expires_at, used_at")
    .eq("invite_code", code)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: jsonError(error.message, 400, { code: "DATABASE_ERROR" }),
    };
  }
  if (!invite) {
    return {
      ok: false,
      response: jsonError("Pozivnica nije pronađena.", 404, {
        code: "INVITE_NOT_FOUND",
      }),
    };
  }

  const { data: agency } = await admin
    .from("agencies")
    .select("name")
    .eq("id", invite.agency_id)
    .maybeSingle();

  return {
    ok: true,
    invite: {
      ...invite,
      agency_name: agency?.name ?? null,
    },
  };
}

export const GET = withApiCatch(async (request: Request) => {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code || code.length < 8 || code.length > 128) {
    return jsonError("Nevažeća pozivnica.", 400, { code: "INVALID_CODE" });
  }

  const looked = await lookupInviteByCode(code);
  if (!looked.ok) return looked.response;
  const { invite } = looked;

  const status = resolveInviteStatus({
    used_at: invite.used_at,
    expires_at: invite.expires_at,
  });

  if (status === "used") {
    return jsonError("Pozivnica je već iskorišćena.", 409, {
      code: "INVITE_ALREADY_USED",
    });
  }
  if (status === "expired") {
    return jsonError(
      "Pozivnica je istekla. Zatraži novu od vlasnika agencije.",
      410,
      { code: "INVITE_EXPIRED" },
    );
  }

  return jsonOk({
    valid: true,
    agency_name: invite.agency_name ?? null,
    email_hint: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
  });
});
