import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/i18n/cookie";
import { normalizeLocale, type Locale } from "@/lib/i18n/index";

/** Jedan upit po request-u (React cache). Samo server. */
export const getUserLocale = cache(async (): Promise<Locale> => {
  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("locale")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.locale) {
        return normalizeLocale(profile.locale);
      }
    }

    return normalizeLocale(cookieLocale);
  } catch {
    return "sr";
  }
});
