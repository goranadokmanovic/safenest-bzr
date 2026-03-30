import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-ink">SafeNest BZR</h1>
      <p className="mt-4 text-ink/80">
        Prijava i registracija su uključene. Poveži{" "}
        <code className="font-mono">.env.local</code> sa Supabase ključevima.
      </p>
      <nav className="mt-8 flex flex-wrap gap-4 text-sm font-medium">
        <Link
          href="/login"
          className="border border-ink bg-accent px-4 py-2 text-ink"
        >
          Prijava
        </Link>
        <Link
          href="/register"
          className="border border-ink bg-surface px-4 py-2 text-ink"
        >
          Registracija
        </Link>
        <Link
          href="/dashboard"
          className="border border-ink bg-surface px-4 py-2 text-ink"
        >
          Kontrolna tabla
        </Link>
      </nav>
      <p className="mt-6 text-sm text-ink/60">
        API provera:{" "}
        <Link href="/api/health" className="underline">
          /api/health
        </Link>
      </p>
    </main>
  );
}
