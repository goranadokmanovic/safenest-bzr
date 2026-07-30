"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { localeCookieValue } from "@/lib/i18n/cookie";
import type { Locale } from "@/lib/i18n/types";

function setLocaleCookie(locale: Locale) {
  document.cookie = localeCookieValue(locale);
}

function LocaleButtons({ compact = false }: { compact?: boolean }) {
  const { locale, m } = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function switchLocale(target: Locale) {
    if (target === locale || loading) return;
    setLoading(true);
    try {
      setLocaleCookie(target);
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: target }),
      }).catch(() => undefined);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const baseBtn = compact
    ? "min-w-[2rem] px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
    : "min-w-[2.25rem] px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50";

  return (
    <div
      className="flex items-center overflow-hidden rounded-full border border-border/30 bg-surface/90 text-xs font-medium shadow-card backdrop-blur"
      role="group"
      aria-label={m.common.languageSwitcher}
    >
      <button
        type="button"
        disabled={loading}
        aria-pressed={locale === "sr"}
        aria-label={m.common.switchToSr}
        onClick={() => void switchLocale("sr")}
        className={[
          baseBtn,
          locale === "sr"
            ? "bg-accent text-ink"
            : "text-ink/60 hover:bg-ink/[0.04] hover:text-ink",
        ].join(" ")}
      >
        SR
      </button>
      <button
        type="button"
        disabled={loading}
        aria-pressed={locale === "en"}
        aria-label={m.common.switchToEn}
        onClick={() => void switchLocale("en")}
        className={[
          baseBtn,
          locale === "en"
            ? "bg-accent text-ink"
            : "text-ink/60 hover:bg-ink/[0.04] hover:text-ink",
        ].join(" ")}
      >
        EN
      </button>
    </div>
  );
}

/** Fixed floating switcher for public / auth pages */
export function LocaleSwitcher() {
  return (
    <div className="bzr-global-chrome fixed left-3 top-3 z-50">
      <LocaleButtons />
    </div>
  );
}

/** Inline switcher for app shell top bar */
export function LocaleSwitcherInline() {
  return <LocaleButtons compact />;
}
