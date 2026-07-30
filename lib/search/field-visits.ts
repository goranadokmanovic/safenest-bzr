/**
 * Semantička (RAG) pretraga terenskih poseta.
 *
 * Izvučeno iz app/api/search/route.ts da bi istu logiku mogli da koriste i
 * HTTP ruta i AI asistent (lib/agent/tools/search-field-visits.ts), bez
 * internog HTTP poziva aplikacije ka samoj sebi.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateEmbedding } from "@/lib/api/embeddings";

export type RiskLevel = "low" | "medium" | "high";

export const fieldVisitSearchSchema = z
  .object({
    query: z.string().max(1000).optional().default(""),
    limit: z.number().int().min(1).max(100).optional(),
    /** Minimalna sličnost (0-1) da bi rezultat uopšte ušao u listu. */
    minSimilarity: z.number().min(0).max(1).optional(),
    /**
     * Eksplicitan filter nivoa rizika (low/medium/high). Ako nije poslat,
     * pokušava se automatska detekcija iz teksta upita (vidi detectRiskLevel).
     */
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine(
    (data) => data.query.trim().length >= 2 || data.riskLevel !== undefined,
    {
      message:
        "Pošalji upit od bar 2 karaktera ili izaberi nivo rizika za filter.",
      path: ["query"],
    },
  );

export type FieldVisitSearchInput = z.infer<typeof fieldVisitSearchSchema>;

export type FieldVisitSearchRow = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  notes: string | null;
  scheduled_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

export type FieldVisitSearchOutcome =
  | {
      ok: true;
      results: FieldVisitSearchRow[];
      detectedRiskLevel: RiskLevel | null;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * Prepoznaje da li upit eksplicitno pominje nivo rizika (srpski i engleski
 * izrazi), bez obzira na redosled reči (npr. i "visok rizik" i "nivo rizika
 * visok" se prepoznaju isto). Vraća null ako upit ne pominje konkretan nivo —
 * tada se filter ne primenjuje i pretraga ostaje čisto semantička.
 */
export function detectRiskLevel(query: string): RiskLevel | null {
  const q = query.toLowerCase();
  const mentionsRiskWord = /rizik|risk/.test(q);
  if (!mentionsRiskWord) return null;

  if (/visok|high/.test(q)) return "high";
  if (/srednj|medium/.test(q)) return "medium";
  if (/nizak|niska|\blow\b/.test(q)) return "low";
  return null;
}

function mapVisitRows(
  rows: Array<{
    id: string;
    client_company_id: string;
    scheduled_at: string;
    status: string;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    client_companies: { name?: string } | { name?: string }[] | null;
  }>,
): FieldVisitSearchRow[] {
  return rows.map((row) => {
    const cc = row.client_companies;
    const name = Array.isArray(cc) ? (cc[0]?.name ?? null) : (cc?.name ?? null);
    return {
      id: row.id,
      client_company_id: row.client_company_id,
      client_name: name,
      notes: row.notes,
      scheduled_at: row.scheduled_at,
      status: row.status,
      metadata: row.metadata,
      similarity: 1,
    };
  });
}

/**
 * `agencyId === null` znači super_admin (bez filtera po agenciji).
 * Sve ostalo prolazi kroz prosleđeni `supabase` klijent, pa važi RLS pozivaoca.
 */
export async function searchFieldVisits(
  supabase: SupabaseClient,
  agencyId: string | null,
  input: FieldVisitSearchInput,
): Promise<FieldVisitSearchOutcome> {
  const queryText = input.query.trim();
  const riskLevel = input.riskLevel ?? detectRiskLevel(queryText) ?? undefined;

  // Samo filter po riziku — bez semantičke pretrage (prazan ili kratak upit).
  if (queryText.length < 2 && input.riskLevel) {
    let dbQuery = supabase
      .from("field_visits")
      .select(
        `
        id,
        client_company_id,
        scheduled_at,
        status,
        notes,
        metadata,
        client_companies ( name )
      `,
      )
      .filter("metadata->>risk_level", "eq", input.riskLevel)
      .order("scheduled_at", { ascending: false })
      .limit(input.limit ?? 30);

    if (agencyId) {
      dbQuery = dbQuery.eq("agency_id", agencyId);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return {
        ok: false,
        status: 400,
        code: "DATABASE_ERROR",
        message: error.message,
      };
    }

    return {
      ok: true,
      results: mapVisitRows(data ?? []),
      detectedRiskLevel: input.riskLevel,
    };
  }

  let queryEmbedding: number[] | null;
  try {
    queryEmbedding = await generateEmbedding(queryText);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      code: "EMBEDDING_ERROR",
      message:
        e instanceof Error ? e.message : "Greška pri generisanju embedding-a.",
    };
  }

  if (!queryEmbedding) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Upit je prazan.",
    };
  }

  const { data, error } = await supabase.rpc("match_field_visits", {
    query_embedding: queryEmbedding,
    match_agency_id: agencyId,
    match_count: input.limit ?? 30,
    match_threshold: input.minSimilarity ?? 0.3,
    match_risk_level: riskLevel ?? null,
  });

  if (error) {
    return {
      ok: false,
      status: 400,
      code: "DATABASE_ERROR",
      message: error.message,
    };
  }

  return {
    ok: true,
    results: (data ?? []) as FieldVisitSearchRow[],
    detectedRiskLevel: riskLevel ?? null,
  };
}
