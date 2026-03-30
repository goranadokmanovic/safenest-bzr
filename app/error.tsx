"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold text-ink">Došlo je do greške</h1>
      <p className="text-ink/80">
        Aplikacija nije mogla da učita ovu stranicu. Možeš pokušati ponovo ili
        se vratiti na početnu.
      </p>
      {process.env.NODE_ENV === "development" && error.message ? (
        <pre className="overflow-x-auto border border-ink bg-surface p-3 text-xs text-red-800">
          {error.message}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="border border-ink bg-accent px-4 py-2 text-sm font-semibold text-ink"
        >
          Pokušaj ponovo
        </button>
        <a
          href="/"
          className="border border-ink bg-surface px-4 py-2 text-sm font-medium text-ink"
        >
          Početna
        </a>
      </div>
    </main>
  );
}
