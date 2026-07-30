import { en } from "@/lib/i18n/messages/en";
import { sr } from "@/lib/i18n/messages/sr";
import type { Locale, Messages, RoleKey } from "@/lib/i18n/types";

export type { Locale, Messages, RoleKey };
export { ROLE_KEYS } from "@/lib/i18n/types";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "sr";
}

export function getMessages(locale: string | null | undefined): Messages {
  return normalizeLocale(locale) === "en" ? en : sr;
}

export function roleLabel(m: Messages, role: string): string {
  if (role in m.roles && role !== "unknownInDb") {
    return m.roles[role as RoleKey];
  }
  return m.roles.unknownInDb.replace("{role}", role);
}
