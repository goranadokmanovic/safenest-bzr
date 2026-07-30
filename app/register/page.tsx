"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Image from "next/image";
import { BackButton } from "@/components/ui/BackButton";
import { PageCornerDecor } from "@/components/brand/PageCornerDecor";

export default function RegisterPage() {
  const router = useRouter();
  const [agencyName, setAgencyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
            agency_name: agencyName.trim(),
          },
        },
      });
      if (signError) {
        setError(signError.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setInfo(
        "Ako je uključena potvrda emaila, proveri sanduče i potvrdi nalog, pa se prijavi.",
      );
      setLoading(false);
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
          Registracija
        </h1>
        <p className="mt-3 text-base text-ink/70">
          Već imaš nalog?{" "}
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Prijava
          </Link>
        </p>

        <form onSubmit={onSubmit} className="bzr-card mt-8 space-y-4">
          <div>
            <label
              htmlFor="agency"
              className="block text-sm font-medium text-ink"
            >
              Ime agencije
            </label>
            <input
              id="agency"
              name="agency"
              type="text"
              required
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="bzr-input mt-1"
            />
          </div>
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-ink"
            >
              Ime i prezime
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bzr-input mt-1"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
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
              className="bzr-input mt-1"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-ink"
            >
              Lozinka
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
              className="bzr-input mt-1"
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
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
            {loading ? "Slanje…" : "Registruj se"}
          </button>
        </form>
      </div>
    </main>
  );
}
