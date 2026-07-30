"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        setLoading(false);
        return;
      }
      router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
      router.refresh();
    } catch {
      setError("Proveri .env.local (Supabase URL i anon ključ).");
      setLoading(false);
    }
  }

  return (
    <main className="bzr-auth-shell">
      <PageCornerDecor kind="halftone" variant="canvas" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <BackButton href="/" className="mb-6" />
        <Image
          src="/brand/logo-web.png"
          alt=""
          width={64}
          height={64}
          className="mb-4 h-14 w-14 object-contain"
          aria-hidden
        />
        <h1 className="font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
          Prijava
        </h1>
        <p className="mt-3 text-base text-ink/70">
          Nemaš nalog?{" "}
          <Link
            href="/register"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Registracija
          </Link>
        </p>

        <form onSubmit={onSubmit} className="bzr-card mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-base font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bzr-input mt-1.5"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-base font-medium text-ink"
            >
              Lozinka
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bzr-input mt-1.5"
            />
          </div>
          {error ? (
            <p className="text-base text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="bzr-btn-primary w-full"
          >
            {loading ? "Prijava…" : "Prijavi se"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-ink">
          Učitavanje…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
