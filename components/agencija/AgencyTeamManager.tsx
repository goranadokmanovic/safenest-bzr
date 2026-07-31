"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

type Member = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  joined_at: string | null;
};

type Seats = { used: number; max: number | null };

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

const ASSIGNABLE_ROLES = [
  "agency_owner",
  "agency_collaborator",
  "field_worker",
] as const;

function initialsOf(name: string): string {
  const parts = name.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function inviteUrl(code: string): string {
  if (typeof window === "undefined") return `/register/worker?code=${code}`;
  return `${window.location.origin}/register/worker?code=${encodeURIComponent(code)}`;
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
    template,
  );
}

export function AgencyTeamManager({ currentUserId }: { currentUserId: string }) {
  const { m, locale, roleLabel } = useTranslations();
  const t = m.agencija.team;
  const inv = m.agencija.invites;

  const [members, setMembers] = useState<Member[]>([]);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/members");
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        members?: Member[];
        seats?: Seats;
      };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setMembers(json.members ?? []);
      setSeats(json.seats ?? null);
    } catch {
      setError(m.common.networkError);
    }
  }, [m.common.error, m.common.networkError]);

  const loadInvites = useCallback(async () => {
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
    void loadMembers();
    void loadInvites();
  }, [loadMembers, loadInvites]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
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
      setLastLink(inviteUrl(json.invite.invite_code));
      setEmail("");
      setMessage(inv.created);
      setInvites((prev) => [json.invite!, ...prev]);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    if (busy) return;
    setBusy(true);
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
      setMessage(inv.revoked);
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, nextRole: string) {
    if (busy || nextRole === member.role) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/agency/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.user_id, role: nextRole }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setMessage(t.roleChanged);
      await loadMembers();
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    if (busy) return;
    const name = member.full_name || member.email || t.noName;
    if (!window.confirm(fill(t.removeConfirm, { name }))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/agency/members?user_id=${encodeURIComponent(member.user_id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? m.common.error);
        return;
      }
      setMessage(t.removed);
      await loadMembers();
    } catch {
      setError(m.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setLastLink(link);
      setMessage(inv.copied);
    } catch {
      setError(m.common.error);
    }
  }

  const dateFmt = (iso: string | null) => {
    if (!iso) return t.unknownJoined;
    try {
      return new Date(iso).toLocaleDateString(
        locale === "en" ? "en-GB" : "sr-Latn-RS",
        { day: "numeric", month: "short", year: "numeric" },
      );
    } catch {
      return iso;
    }
  };

  const seatsLabel = seats
    ? seats.max == null
      ? fill(t.seatsUnlimited, { used: String(seats.used) })
      : fill(t.seats, { used: String(seats.used), max: String(seats.max) })
    : null;

  const pendingInvites = invites.filter((i) => i.status === "active");

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {seatsLabel ? (
          <p className="text-sm text-ink/70">{seatsLabel}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setInviteOpen((v) => !v)}
          className="bzr-btn-primary"
        >
          {inviteOpen ? t.inviteClose : t.inviteCta}
        </button>
      </div>

      {inviteOpen ? (
        <form
          onSubmit={createInvite}
          className="space-y-4 border border-ink/20 p-4"
        >
          <h2 className="text-sm font-semibold text-ink">{inv.generateTitle}</h2>
          <p className="text-xs text-ink/60">{inv.generateHint}</p>
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium">
              {inv.emailOptional}
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={inv.emailPlaceholder}
              className="mt-1 w-full max-w-md rounded-lg border border-border/40 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" disabled={busy} className="bzr-btn-primary">
            {busy ? m.common.loading : inv.generate}
          </button>
        </form>
      ) : null}

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
          <p className="text-xs font-medium text-ink/70">{inv.shareLink}</p>
          <code className="block break-all text-xs text-ink">{lastLink}</code>
          <button
            type="button"
            onClick={() => void copyLink(lastLink)}
            className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
          >
            {inv.copyLink}
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-ink">{t.listTitle}</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{t.empty}</p>
        ) : (
          <div className="bzr-table-wrap bzr-team-table mt-3">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 font-semibold">{t.colName}</th>
                  <th className="px-3 py-2 font-semibold">{t.colEmail}</th>
                  <th className="px-3 py-2 font-semibold">{t.colRole}</th>
                  <th className="px-3 py-2 font-semibold">{t.colJoined}</th>
                  <th className="px-3 py-2 font-semibold">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.user_id === currentUserId;
                  const name = member.full_name || t.noName;
                  return (
                    <tr key={member.user_id} className="border-t border-ink/10">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2.5">
                          <span className="bzr-user-avatar" aria-hidden>
                            {initialsOf(member.full_name || member.email || "?")}
                          </span>
                          <span className="break-words font-medium">
                            {name}
                            {isSelf ? (
                              <span className="ml-2 text-xs font-normal text-ink/50">
                                ({t.you})
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 break-words text-ink/80">
                        {member.email}
                      </td>
                      <td className="px-3 py-2">
                        {isSelf ? (
                          <span className="bzr-badge-neutral">
                            {roleLabel(member.role)}
                          </span>
                        ) : (
                          <>
                            <label
                              htmlFor={`role-${member.user_id}`}
                              className="sr-only"
                            >
                              {fill(t.roleChangeLabel, { name })}
                            </label>
                            <select
                              id={`role-${member.user_id}`}
                              value={member.role}
                              disabled={busy}
                              onChange={(e) =>
                                void changeRole(member, e.target.value)
                              }
                              className="rounded-lg border border-border/40 px-2 py-1 text-sm"
                            >
                              {ASSIGNABLE_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabel(role)}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink/70">
                        {dateFmt(member.joined_at)}
                      </td>
                      <td className="px-3 py-2">
                        {isSelf ? null : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeMember(member)}
                            className="border border-red-800 px-2 py-1 text-xs text-red-800"
                          >
                            {t.remove}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink">{inv.listTitle}</h2>
        {pendingInvites.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{inv.empty}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="border border-ink/20 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {inv.statusActive}
                      {invite.email ? (
                        <span className="ml-2 font-normal text-ink/70">
                          {invite.email}
                        </span>
                      ) : (
                        <span className="ml-2 font-normal text-ink/50">
                          {inv.genericInvite}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink/60">
                      {inv.createdAt}: {dateFmt(invite.created_at)} ·{" "}
                      {inv.expiresAt}: {dateFmt(invite.expires_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copyLink(inviteUrl(invite.invite_code))}
                      className="text-xs underline underline-offset-2"
                    >
                      {inv.copyLink}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revokeInvite(invite.id)}
                    className="border border-red-800 px-2 py-1 text-xs text-red-800"
                  >
                    {inv.revoke}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
