"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

type InviteRow = {
  id: string;
  email: string | null;
  invite_code: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  status: "active" | "used" | "expired";
};

function inviteUrl(code: string): string {
  if (typeof window === "undefined") return `/register/worker?code=${code}`;
  return `${window.location.origin}/register/worker?code=${encodeURIComponent(code)}`;
}

export function AgencyInvitesManager() {
  const { m, locale } = useTranslations();
  const t = m.agencija.invites;
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/invites");
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        invites?: InviteRow[];
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setInvites(json.invites ?? []);
    } catch {
      setError(m.common.networkError);
    }
  }, [m.common.error, m.common.networkError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const res = await fetch("/api/agency/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        invite?: InviteRow;
      };
      if (!res.ok || !json.invite) {
        setError(json.error ?? m.common.error);
        return;
      }
      const link = inviteUrl(json.invite.invite_code);
      setLastLink(link);
      setEmail("");
      setMessage(t.created);
      setInvites((prev) => [json.invite!, ...prev]);
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function revoke(id: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agency/invites?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== id));
      setMessage(t.revoked);
    } catch {
      setError(m.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setLastLink(link);
      setMessage(t.copied);
    } catch {
      setError(m.common.error);
    }
  }

  const dateFmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(
        locale === "en" ? "en-GB" : "sr-Latn-RS",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      );
    } catch {
      return iso;
    }
  };

  const statusLabel = (s: InviteRow["status"]) =>
    s === "active" ? t.statusActive : s === "used" ? t.statusUsed : t.statusExpired;

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={createInvite} className="space-y-4 border border-ink/20 p-4">
        <h2 className="text-sm font-semibold text-ink">{t.generateTitle}</h2>
        <p className="text-xs text-ink/60">{t.generateHint}</p>
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium">
            {t.emailOptional}
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            className="mt-1 w-full max-w-md rounded-lg border border-border/40 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bzr-btn-primary"
        >
          {loading ? m.common.loading : t.generate}
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-ink/80" role="status">
          {message}
        </p>
      ) : null}

      {lastLink ? (
        <div className="space-y-2 border border-ink/20 bg-ink/[0.02] p-4">
          <p className="text-xs font-medium text-ink/70">{t.shareLink}</p>
          <code className="block break-all text-xs text-ink">{lastLink}</code>
          <button
            type="button"
            onClick={() => void copyLink(lastLink)}
            className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
          >
            {copied ? t.copied : t.copyLink}
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-ink">{t.listTitle}</h2>
        {invites.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{t.empty}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="border border-ink/20 p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {statusLabel(invite.status)}
                      {invite.email ? (
                        <span className="ml-2 font-normal text-ink/70">
                          {invite.email}
                        </span>
                      ) : (
                        <span className="ml-2 font-normal text-ink/50">
                          {t.genericInvite}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink/60">
                      {t.createdAt}: {dateFmt(invite.created_at)} · {t.expiresAt}:{" "}
                      {dateFmt(invite.expires_at)}
                    </p>
                    {invite.status === "active" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void copyLink(inviteUrl(invite.invite_code))
                        }
                        className="text-xs underline underline-offset-2"
                      >
                        {t.copyLink}
                      </button>
                    ) : null}
                  </div>
                  {invite.status === "active" ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void revoke(invite.id)}
                      className="border border-red-800 px-2 py-1 text-xs text-red-800"
                    >
                      {t.revoke}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
