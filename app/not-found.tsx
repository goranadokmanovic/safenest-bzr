import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold text-ink">Stranica nije pronađena</h1>
      <p className="text-ink/80">
        Adresa ne postoji ili je uklonjena.
      </p>
      <Link
        href="/"
        className="inline-flex w-fit border border-ink bg-accent px-4 py-2 text-sm font-semibold text-ink"
      >
        Na početnu
      </Link>
    </main>
  );
}
