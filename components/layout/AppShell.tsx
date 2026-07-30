"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BrandDecor } from "@/components/brand/BrandDecor";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LocaleSwitcherInline } from "@/components/i18n/LocaleSwitcher";
import { SessionUserBadge } from "@/components/layout/SessionUserBadge";

export type SidebarLink = {
  href: string;
  label: string;
  exact?: boolean;
};

type AppShellProps = {
  homeHref: string;
  title: string;
  subtitle?: string;
  links: SidebarLink[];
  footerLinks?: SidebarLink[];
  children: ReactNode;
};

function linkActive(pathname: string, link: SidebarLink) {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function AppShell({
  homeHref,
  title,
  subtitle = "Bez Zrna Rizika",
  links,
  footerLinks = [],
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const allLinks = useMemo(
    () => [...links, ...footerLinks],
    [links, footerLinks],
  );

  useEffect(() => {
    setOpen(false);
    setPendingHref(null);
  }, [pathname]);

  /* Prefetch sidebar routes so clicks feel instant */
  useEffect(() => {
    for (const link of allLinks) {
      router.prefetch(link.href);
    }
  }, [allLinks, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function renderLink(link: SidebarLink) {
    const active = linkActive(pathname, link);
    const pending = pendingHref === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        prefetch
        onClick={() => {
          if (!active) setPendingHref(link.href);
          setOpen(false);
        }}
        onMouseEnter={() => router.prefetch(link.href)}
        className={[
          "bzr-side-link",
          active || pending ? "is-active" : "",
          pending && !active ? "is-pending" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="truncate">{link.label}</span>
      </Link>
    );
  }

  return (
    <div className="bzr-shell min-h-screen bg-bg text-ink">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-overlay/60 backdrop-blur-md lg:hidden"
          aria-label="Zatvori meni"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={[
          "bzr-sidebar fixed inset-y-0 left-0 z-[60] flex w-[19rem] flex-col transition-transform duration-300 ease-luxury lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <BrandDecor
          kind="halftone"
          layer="background"
          sizeClassName="h-[18rem] w-[18rem] sm:h-[22rem] sm:w-[22rem]"
          className="bzr-sidebar-deco bzr-motif !absolute -bottom-[40%] -left-[45%] !rotate-[48deg]"
        />

        <div className="relative z-10 px-5 pb-5 pt-7">
          <div className="flex items-center gap-3.5">
            <div className="bzr-sidebar-logo">
              <BrandLogo href={homeHref} variant="mark" priority />
            </div>
            <div className="min-w-0">
              <p className="bzr-eyebrow truncate">{subtitle}</p>
              {title.replace(/^BZR\s*[—–-]\s*/i, "").trim() ? (
                <p className="mt-1 truncate font-display text-xl font-semibold leading-tight tracking-tight text-ink">
                  {title.replace(/^BZR\s*[—–-]\s*/i, "")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="bzr-divider !my-5" />
        </div>

        <nav
          className="relative z-10 flex flex-1 flex-col gap-1.5 px-3"
          aria-label="Glavna navigacija"
        >
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.26em] text-accent-muted">
            Navigacija
          </p>
          {links.map(renderLink)}

          {footerLinks.length > 0 ? (
            <div className="mt-auto space-y-1 pt-6">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.26em] text-ink/35">
                Nalog
              </p>
              {footerLinks.map(renderLink)}
            </div>
          ) : (
            <div className="mt-auto" />
          )}
        </nav>

        <div className="relative z-10 px-4 pb-5 pt-4">
          <div className="bzr-sidebar-footer">
            <LogoutButton />
            <button
              type="button"
              className="bzr-btn-ghost bzr-btn-sm lg:hidden"
              onClick={() => setOpen(false)}
            >
              Zatvori
            </button>
          </div>
        </div>
      </aside>

      <div className="bzr-shell-main relative z-[1] lg:pl-[19rem]">
        <header className="bzr-topbar sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-7">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="bzr-btn-secondary bzr-btn-sm inline-flex !h-10 !w-10 !items-center !justify-center !p-0 lg:hidden"
              aria-label="Otvori meni"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden
              >
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <Link
              href={homeHref}
              prefetch
              className="font-display text-lg font-semibold tracking-tight text-ink/85 transition hover:text-accent lg:hidden"
            >
              {title.replace(/^BZR\s*[—–-]\s*/i, "").trim() || "BZR"}
            </Link>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-4">
            <SessionUserBadge />
            <LocaleSwitcherInline />
            <ThemeToggle />
          </div>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 py-9 sm:px-7 [:has(.bzr-clients-page,.bzr-field-visits-page)]:max-w-[92rem]">
          {children}
        </div>
      </div>
    </div>
  );
}
