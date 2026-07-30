import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { replaceReferenceData, internalStore } from "@/lib/offline/indexedDB";
import { REFERENCE_TABLES } from "@/lib/offline/config";

const META = "_meta";
const LAST_REPLICATION_KEY = "last_replication_at";

/**
 * Replikuje read-only referentne podatke (agencije, klijenti, zaposleni) sa
 * servera u IndexedDB. RLS na serveru ograničava na podatke korisnikove agencije.
 */
export async function replicateReferenceData(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, error: "offline" };
  }

  let supabase;
  try {
    supabase = createBrowserSupabaseClient();
  } catch {
    return { ok: false, error: "supabase-config" };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "unauthenticated" };
    }

    for (const table of REFERENCE_TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        return { ok: false, error: `${table}: ${error.message}` };
      }
      const rows = (data ?? []).filter(
        (r): r is { id: string } & Record<string, unknown> =>
          typeof (r as { id?: unknown }).id === "string",
      );
      await replaceReferenceData(table, rows);
    }

    await internalStore(META).setItem(LAST_REPLICATION_KEY, Date.now());
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

export async function getLastReplicationAt(): Promise<number | null> {
  return (
    (await internalStore(META).getItem<number>(LAST_REPLICATION_KEY)) ?? null
  );
}
