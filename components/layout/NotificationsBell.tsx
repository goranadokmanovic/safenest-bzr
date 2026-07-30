"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

type NotificationRow = {
  id: string;
  created_at: string;
  type: string;
  title: string;
  body: string;
  severity: string | null;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
};

function severityClass(type: string, severity: string | null): string {
  if (type === "compliance_expired" || severity === "critical") {
    return "border-l-red-600 bg-red-50/80 dark:bg-red-950/30";
  }
  if (type === "compliance_expiring" || severity === "warning") {
    return "border-l-amber-500 bg-amber-50/70 dark:bg-amber-950/25";
  }
  return "border-l-ink/25 bg-ink/[0.03]";
}

function hrefFrom(meta: Record<string, unknown> | null): string | null {
  const href = meta?.href;
  return typeof href === "string" && href.startsWith("/") ? href : null;
}

export function NotificationsBell() {
  const { m, locale } = useTranslations();
  const n = m.notifications;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((x) => !x.read_at).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=30");
      const json = (await res.json().catch(() => ({}))) as {
        notifications?: NotificationRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? n.loadFailed);
        return;
      }
      setItems(json.notifications ?? []);
    } catch {
      setError(n.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [n.loadFailed]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setItems((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      );
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((row) => ({ ...row, read_at: row.read_at ?? now })));
    } catch {
      /* ignore */
    }
  }

  function formatWhen(iso: string): string {
    try {
      return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "sr-RS", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="bzr-notif-bell relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/35 bg-accent/10 text-accent shadow-sm transition hover:border-accent/55 hover:bg-accent/18 hover:text-accent-bright"
        aria-label={n.open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2a6 6 0 0 0-6 6v3.2c0 .4-.1.8-.4 1.1L4.2 14a1.2 1.2 0 0 0 .9 2h13.8a1.2 1.2 0 0 0 .9-2l-1.4-1.7c-.3-.3-.4-.7-.4-1.1V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
        </svg>
        {unread > 0 ? (
          <span className="bzr-notif-badge absolute -right-1.5 -top-1.5 flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={n.title}
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/40 bg-surface shadow-elevated"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">{n.title}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-accent hover:underline"
              >
                {n.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink/60">
                {m.common.loading}
              </p>
            ) : error ? (
              <p className="px-3 py-6 text-center text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink/55">{n.empty}</p>
            ) : (
              <ul className="divide-y divide-ink/8">
                {items.map((row) => {
                  const href = hrefFrom(row.metadata);
                  const unreadRow = !row.read_at;
                  const inner = (
                    <>
                      <p
                        className={[
                          "text-sm leading-snug text-ink",
                          unreadRow ? "font-semibold" : "font-medium",
                        ].join(" ")}
                      >
                        {row.title}
                      </p>
                      {row.body ? (
                        <p className="mt-0.5 text-xs leading-snug text-ink/70">
                          {row.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-ink/45">
                        {formatWhen(row.created_at)}
                      </p>
                    </>
                  );

                  const boxClass = [
                    "block border-l-4 px-3 py-2.5 transition hover:bg-ink/[0.04]",
                    severityClass(row.type, row.severity),
                    unreadRow ? "opacity-100" : "opacity-80",
                  ].join(" ");

                  return (
                    <li key={row.id}>
                      {href ? (
                        <Link
                          href={href}
                          className={boxClass}
                          onClick={() => {
                            void markRead(row.id);
                            setOpen(false);
                          }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={`w-full text-left ${boxClass}`}
                          onClick={() => void markRead(row.id)}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
