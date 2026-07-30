"use client";

import { createContext, useContext, useMemo } from "react";
import {
  getMessages,
  roleLabel as rl,
  type Locale,
  type Messages,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  m: Messages;
  roleLabel: (role: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const m = getMessages(locale);
    return {
      locale,
      m,
      roleLabel: (role: string) => rl(m, role),
    };
  }, [locale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    const m = getMessages("sr");
    return {
      locale: "sr",
      m,
      roleLabel: (role: string) => rl(m, role),
    };
  }
  return ctx;
}
