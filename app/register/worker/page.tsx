"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BackButton } from "@/components/ui/BackButton";
import { useTranslations } from "@/components/i18n/locale-provider";

function WorkerRegisterForm() {
  const { m } = useTranslations();
  const t = m.auth.workerRegister;
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim() ?? "";

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        setSessionEmail(user?.email ?? null);
      } catch {
        if (!cancelled) setSessionEmail(null);
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        setValidateError(t.invalidCode);
        setValidating(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/agency/invite/validate?code=${encodeURIComponent(code)}`,
        );
        const ct = res.headers.get("content-type") ?? "";
        const json = (
          ct.includes("application/json")
            ? await res.json().catch(() => ({}))
            : {}
        ) as {
          error?: string;
          agency_name?: string | null;
          email_hint?: string | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          setValidateError(json.error ?? t.invalidCode);
          setValidating(false);
          return;
        }
        setAgencyName(json.agency_name ?? null);
        if (json.email_hint) {
          setEmailHint(json.email_hint);
          setEmail(json.email_hint);
        }
        setValidating(false);
      } catch {
        if (!cancelled) {
          setValidateError(m.common.networkError);
          setValidating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, t.invalidCode, m.common.networkError]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSessionEmail(null);
    setLoggingOut(false);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !code || sessionEmail) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            invite_code: code,
          },
        },
      });
      if (signError) {
        setError(signError.message);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setInfo(t.confirmEmail);
        setLoading(false);
        return;
      }

      const acceptRes = await fetch("/api/agency/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const acceptJson = (await acceptRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!acceptRes.ok) {
        setError(acceptJson.error ?? t.acceptFailed);
        setLoading(false);
        return;
      }

      router.push("/agencija");
      router.refresh();
    } catch {
      setError(t.envError);
      setLoading(false);
    }
  }

  if (!sessionChecked || validating) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm text-ink/70">{t.validating}</p>
      </main>
    );
  }

  if (sessionEmail) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <BackButton href="/agencija" className="mb-6" />
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="mt-4 text-sm text-ink/80" role="status">
          {t.alreadyLoggedIn.replace("{email}", sessionEmail)}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="bzr-btn-primary"
          >
            {loggingOut ? m.common.loading : t.logoutToRegister}
          </button>
          <Link
            href="/agencija"
            className="rounded-lg border border-border/40 px-4 py-2 text-sm"
          >
            {t.goToAgency}
          </Link>
        </div>
      </main>
    );
  }

  if (validateError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <BackButton href="/login" className="mb-6" />
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="mt-4 text-sm text-red-700" role="alert">
          {validateError}
        </p>
        <p className="mt-3 text-sm text-ink/70">{t.askOwner}</p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="underline">
            {t.backToLogin}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BackButton href="/login" className="mb-6" />
      <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      <p className="mt-2 text-sm text-ink/70">
        {t.intro.replace("{agency}", agencyName ?? "—")}
      </p>
      <p className="mt-2 text-sm text-ink/70">
        {t.ownerRegisterHint}{" "}
        <Link href="/register" className="underline">
          {t.ownerRegisterLink}
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="fullName"
            className="block text-sm font-medium text-ink"
          >
            {t.fullName}
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            {t.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={Boolean(emailHint)}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink disabled:bg-ink/[0.04]"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-ink"
          >
            {t.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-ink/80" role="status">
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="bzr-btn-primary w-full"
        >
          {loading ? t.submitting : t.submit}
        </button>
      </form>
    </main>
  );
}

export default function WorkerRegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
          <p className="text-sm text-ink/70">…</p>
        </main>
      }
    >
      <WorkerRegisterForm />
    </Suspense>
  );
}
