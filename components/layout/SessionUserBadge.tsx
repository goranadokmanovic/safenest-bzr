"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { ROLE_KEYS, type RoleKey } from "@/lib/i18n/types";

type SessionProfile = {
  full_name: string | null;
  email: string | null;
  role: string | null;
};

function isRoleKey(value: string | null): value is RoleKey {
  return !!value && (ROLE_KEYS as readonly string[]).includes(value);
}

function initialsOf(name: string): string {
  const parts = name.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join("");
}

/** Ime i uloga ulogovanog korisnika u gornjem desnom uglu. */
export function SessionUserBadge() {
  const { m } = useTranslations();
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { profile?: SessionProfile } | null) => {
        if (!cancelled) setProfile(json?.profile ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!profile) return null;

  const name = profile.full_name?.trim() || profile.email?.trim() || "";
  if (!name) return null;

  const roleLabel = isRoleKey(profile.role)
    ? m.roles[profile.role]
    : m.roles.unknownInDb;

  return (
    <div
      className="flex items-center gap-2.5"
      aria-label={`${name} — ${roleLabel}`}
      title={`${name} — ${roleLabel}`}
    >
      <div className="hidden text-right leading-tight sm:block">
        <p className="max-w-[13rem] truncate text-sm font-semibold text-ink">
          {name}
        </p>
        <p className="truncate text-[0.6875rem] uppercase tracking-[0.16em] text-accent-muted">
          {roleLabel}
        </p>
      </div>
      <span className="bzr-user-avatar" aria-hidden>
        {initialsOf(name)}
      </span>
    </div>
  );
}
