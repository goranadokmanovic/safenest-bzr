"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  enabled: boolean;
  /** Sa servera (JWT sesija) — pouzdanije od klijentskog getUser u dev/Strict Mode */
  agencyNameHint?: string | null;
  fullNameHint?: string | null;
};

export function AgencyBootstrap({
  enabled,
  agencyNameHint,
  fullNameHint,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState("idle");
      setMessage(null);
      return;
    }

    const ac = new AbortController();
    setState("running");
    setMessage(null);

    (async () => {
      try {
        let agencyName =
          typeof agencyNameHint === "string" ? agencyNameHint.trim() : "";
        let fullName =
          typeof fullNameHint === "string" ? fullNameHint.trim() : "";

        if (!agencyName || !fullName) {
          try {
            const supabase = createBrowserSupabaseClient();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const meta = user?.user_metadata as
              | Record<string, unknown>
              | undefined;
            if (!agencyName) {
              agencyName =
                typeof meta?.agency_name === "string"
                  ? meta.agency_name.trim()
                  : "";
            }
            if (!fullName) {
              fullName =
                typeof meta?.full_name === "string"
                  ? meta.full_name.trim()
                  : "";
            }
          } catch {
            /* env / klijent */
          }
        }

        const payload = JSON.stringify({
          agencyName,
          fullName,
        });

        const res = await fetch("/api/auth/bootstrap-agency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: ac.signal,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setState("error");
          setMessage(json.error ?? "Greška pri kreiranju agencije.");
          return;
        }
        setState("done");
        router.refresh();
      } catch (e) {
        if (ac.signal.aborted) return;
        const aborted =
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError");
        if (aborted) return;
        setState("error");
        setMessage("Mrežna greška.");
      }
    })();

    return () => ac.abort();
  }, [enabled, agencyNameHint, fullNameHint, router]);

  if (!enabled) return null;
  if (state === "running") {
    return (
      <p className="mt-4 text-sm text-ink/70">Kreiranje agencije…</p>
    );
  }
  if (state === "error" && message) {
    return (
      <p className="mt-4 text-sm text-red-700" role="alert">
        {message}
      </p>
    );
  }
  return null;
}
