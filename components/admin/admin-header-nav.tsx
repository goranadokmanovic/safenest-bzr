"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTranslations } from "@/components/i18n/locale-provider";
import { usePathname } from "next/navigation";

export function AdminHeaderNav() {
  const { m } = useTranslations();
  const pathname = usePathname();

  const links = [
    { href: "/admin/agencies", label: m.admin.nav.agencies },
    { href: "/admin/users", label: m.admin.nav.users },
    { href: "/admin/audit", label: m.admin.nav.audit },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/20 bg-surface/85 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <BrandLogo href="/admin" variant="web" />
          <div className="hidden min-w-0 md:block">
            <p className="bzr-eyebrow">Bez Zrna Rizika</p>
            <p className="text-sm font-semibold tracking-tight text-ink">
              {m.admin.title}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "bzr-nav-link",
                    active
                      ? "!bg-accent/15 !text-ink ring-1 ring-accent/30"
                      : "",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="bzr-btn-ghost bzr-btn-sm">
            {m.common.dashboard}
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
