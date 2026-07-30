import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isClientPortalUser, isSuperAdmin } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { generateEmbedding } from "@/lib/api/embeddings";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import { z } from "zod";

const searchBodySchema = z
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

/**
 * Prepoznaje da li upit eksplicitno pominje nivo rizika (srpski i engleski
 * izrazi), bez obzira na redosled reči (npr. i "visok rizik" i "nivo rizika
 * visok" se prepoznaju isto). Vraća null ako upit ne pominje konkretan nivo —
 * tada se filter ne primenjuje i pretraga ostaje čisto semantička.
 */
function detectRiskLevel(query: string): "low" | "medium" | "high" | null {
  const q = query.toLowerCase();
  const mentionsRiskWord = /rizik|risk/.test(q);
  if (!mentionsRiskWord) return null;

  if (/visok|high/.test(q)) return "high";
  if (/srednj|medium/.test(q)) return "medium";
  if (/nizak|niska|\blow\b/.test(q)) return "low";
  return null;
}

type SearchResultRow = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  notes: string | null;
  scheduled_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

function mapVisitRows(
  rows: Array<{
    id: string;
    client_company_id: string;
    scheduled_at: string;
    status: string;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    client_companies:
      | { name?: string }
      | { name?: string }[]
      | null;
  }>,
): SearchResultRow[] {
  return rows.map((row) => {
    const cc = row.client_companies;
    const name = Array.isArray(cc) ? cc[0]?.name ?? null : cc?.name ?? null;
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

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = searchBodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const agencyId = isSuperAdmin(profile) ? null : profile.agency_id;
  if (!isSuperAdmin(profile) && !agencyId) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const queryText = parsed.data.query.trim();
  const riskLevel =
    parsed.data.riskLevel ?? detectRiskLevel(queryText) ?? undefined;

  // Samo filter po riziku — bez semantičke pretrage (prazan ili kratak upit).
  if (queryText.length < 2 && parsed.data.riskLevel) {
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
      .filter("metadata->>risk_level", "eq", parsed.data.riskLevel)
      .order("scheduled_at", { ascending: false })
      .limit(parsed.data.limit ?? 30);

    if (agencyId) {
      dbQuery = dbQuery.eq("agency_id", agencyId);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
    }

    return jsonOk({
      results: mapVisitRows(data ?? []),
      detectedRiskLevel: parsed.data.riskLevel,
    });
  }

  let queryEmbedding: number[] | null;
  try {
    queryEmbedding = await generateEmbedding(queryText);
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Greška pri generisanju embedding-a.",
      502,
      { code: "EMBEDDING_ERROR" },
    );
  }

  if (!queryEmbedding) {
    return jsonError("Upit je prazan.", 400, { code: "VALIDATION_ERROR" });
  }

  const { data, error } = await supabase.rpc("match_field_visits", {
    query_embedding: queryEmbedding,
    match_agency_id: agencyId,
    match_count: parsed.data.limit ?? 30,
    match_threshold: parsed.data.minSimilarity ?? 0.3,
    match_risk_level: riskLevel ?? null,
  });

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({ results: data ?? [], detectedRiskLevel: riskLevel ?? null });
});
