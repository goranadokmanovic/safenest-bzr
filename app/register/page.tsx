"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-ink">Registracija</h1>
      <p className="mt-2 text-sm text-ink/70">
        Već imaš nalog?{" "}
        <Link href="/login" className="underline">
          Prijava
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
            className="mt-1 w-full border border-ink px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
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
            className="mt-1 w-full border border-ink px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
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
            className="mt-1 w-full border border-ink px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
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
            className="mt-1 w-full border border-ink px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-ink"
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
          className="w-full border border-ink bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {loading ? "Slanje…" : "Registruj se"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm">
        <Link href="/" className="underline">
          Nazad na početnu
        </Link>
      </p>
    </main>
  );
}
