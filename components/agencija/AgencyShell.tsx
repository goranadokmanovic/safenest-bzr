"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useTranslations } from "@/components/i18n/locale-provider";
import { ZrnaFloatingChat } from "@/components/agencija/asistent/ZrnaFloatingChat";

export function AgencyShell({
  canManageTemplates = false,
  children,
}: {
  canManageTemplates?: boolean;
  children: ReactNode;
}) {
  const { m } = useTranslations();

  const links = [
    { href: "/dashboard", label: m.common.dashboard, exact: true },
    { href: "/agencija/klijenti", label: m.agencija.nav.clients },
    { href: "/agencija/field-visits", label: m.agencija.nav.fieldVisits },
    { href: "/agencija/pretraga", label: m.agencija.nav.search },
    ...(canManageTemplates
      ? [
          {
            href: "/agencija/report-templates",
            label: m.agencija.nav.reportTemplates,
          },
          { href: "/agencija/radnici", label: m.agencija.nav.team },
          { href: "/agencija/delegacije", label: m.agencija.nav.delegations },
        ]
      : []),
  ];

  return (
    <AppShell
      homeHref="/dashboard"
      title=""
      subtitle="Bez Zrna Rizika"
      links={links}
      footerLinks={[{ href: "/", label: "Početna" }]}
    >
      {children}
      <ZrnaFloatingChat />
    </AppShell>
  );
}
