"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useTranslations } from "@/components/i18n/locale-provider";

export function AdminShell({ children }: { children: ReactNode }) {
  const { m } = useTranslations();

  const links = [
    { href: "/admin", label: "Pregled", exact: true },
    { href: "/admin/agencies", label: m.admin.nav.agencies },
    { href: "/admin/users", label: m.admin.nav.users },
    { href: "/admin/audit", label: m.admin.nav.audit },
  ];

  return (
    <AppShell
      homeHref="/admin"
      title={m.admin.title}
      links={links}
      footerLinks={[{ href: "/dashboard", label: m.common.dashboard }]}
    >
      {children}
    </AppShell>
  );
}
