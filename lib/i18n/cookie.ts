import type { Locale } from "@/lib/i18n/types";
import { normalizeLocale } from "@/lib/i18n/index";

export const LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function localeCookieValue(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};SameSite=Lax`;
}

export function readLocaleFromCookie(
  cookieHeader: string | null | undefined,
): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  if (!match) return null;
  const value = match.slice(LOCALE_COOKIE.length + 1);
  return normalizeLocale(value);
}
