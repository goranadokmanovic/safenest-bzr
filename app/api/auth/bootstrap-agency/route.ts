import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { slugify, uniqueSlugCandidate } from "@/lib/slug";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const POST = withApiCatch(async (request: Request) => {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return jsonError("Server nema podešene Supabase promenljive.", 500, {
      code: "CONFIG_ERROR",
    });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Niste prijavljeni.", 401, { code: "UNAUTHORIZED" });
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return jsonError(
      "Dodaj SUPABASE_SERVICE_ROLE_KEY u .env.local (isti kao za Stripe webhook). Potreban je da se kreira agencija mimo RLS pravila.",
      503,
      { code: "CONFIG_ERROR" },
    );
  }

  const raw = await readJsonBody(request, 32 * 1024);
  if (!raw.ok) return raw.response;

  const body =
    raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)
      ? (raw.value as Record<string, unknown>)
      : {};

  let agencyName =
    typeof body.agencyName === "string" ? body.agencyName.trim() : "";
  let fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";

  if (!agencyName) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    agencyName =
      typeof meta?.agency_name === "string" ? meta.agency_name.trim() : "";
  }
  if (!fullName) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    fullName =
      typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (typeof meta?.invite_code === "string" && meta.invite_code.trim()) {
    return jsonError(
      "Nalog je registrovan preko pozivnice. Koristi link pozivnice za pridruživanje agenciji.",
      400,
      { code: "INVITE_REGISTRATION" },
    );
  }

  if (!agencyName) {
    return jsonError("Ime agencije je obavezno.", 400, {
      code: "VALIDATION_ERROR",
    });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("user_id, agency_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return jsonError("Profil nije pronađen.", 400, { code: "PROFILE_MISSING" });
  }

  if (profile.agency_id) {
    return jsonOk({ ok: true, already: true });
  }

  if (profile.role === "super_admin" || profile.role === "client_user") {
    return jsonOk({ ok: true, skipped: true });
  }

  let slug = slugify(agencyName);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  const tryInsert = async (s: string) =>
    admin
      .from("agencies")
      .insert({
        name: agencyName,
        slug: s,
        trial_ends_at: trialEnds.toISOString(),
        subscription_status: "trialing",
        plan_tier: "agency_basic",
      })
      .select("id")
      .single();

  let { data: agency, error: agencyError } = await tryInsert(slug);
  if (agencyError?.code === "23505") {
    slug = uniqueSlugCandidate(slugify(agencyName));
    ({ data: agency, error: agencyError } = await tryInsert(slug));
  }

  if (agencyError || !agency) {
    return jsonError(
      agencyError?.message ?? "Greška pri kreiranju agencije.",
      400,
      { code: "DATABASE_ERROR" },
    );
  }

  const { error: memberError } = await admin.from("agency_members").insert({
    agency_id: agency.id,
    user_id: user.id,
    member_role: "owner",
  });

  if (memberError) {
    await admin.from("agencies").delete().eq("id", agency.id);
    return jsonError(memberError.message, 400, { code: "DATABASE_ERROR" });
  }

  const profileUpdate: Record<string, string> = {
    agency_id: agency.id,
    role: "agency_owner",
  };
  if (fullName) profileUpdate.full_name = fullName;

  const { error: updateError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("user_id", user.id);

  if (updateError) {
    await admin.from("agency_members").delete().match({
      agency_id: agency.id,
      user_id: user.id,
    });
    await admin.from("agencies").delete().eq("id", agency.id);
    return jsonError(updateError.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ ok: true, agencyId: agency.id });
});
