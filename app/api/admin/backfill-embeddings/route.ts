import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin } from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { generateEmbedding, buildVisitEmbeddingText } from "@/lib/api/embeddings";
import { withApiCatch } from "@/lib/api/with-api-catch";

export const dynamic = "force-dynamic";

/**
 * Jednokratna (ručno pokrenuta) ruta koja generiše embedding za sve postojeće
 * terenske posete kojima nedostaje (napravljene pre uvođenja RAG pretrage).
 * Samo super_admin sme da je pokrene. Poziva se ručno, nije deo redovnog toka.
 */
export const POST = withApiCatch(async () => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase } = guard.ctx;

  if (!isSuperAdmin(profile)) {
    return jsonError("Samo super admin može pokrenuti backfill.", 403, {
      code: "FORBIDDEN",
    });
  }

  const { data: visits, error } = await supabase
    .from("field_visits")
    .select("id, client_company_id, notes, metadata")
    .is("embedding", null)
    .limit(200);

  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  if (!visits || visits.length === 0) {
    return jsonOk({ processed: 0, updated: 0, failed: 0, message: "Nema poseta bez embedding-a." });
  }

  let updated = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const visit of visits) {
    try {
      let clientName: string | null = null;
      if (visit.client_company_id) {
        const { data: client } = await supabase
          .from("client_companies")
          .select("name")
          .eq("id", visit.client_company_id)
          .maybeSingle();
        clientName = client?.name ?? null;
      }

      const meta =
        visit.metadata && typeof visit.metadata === "object"
          ? (visit.metadata as Record<string, unknown>)
          : {};

      const text = buildVisitEmbeddingText({
        clientName,
        notes: visit.notes,
        riskLevel: typeof meta.risk_level === "string" ? meta.risk_level : null,
        extractedText:
          typeof meta.extracted_text === "string" ? meta.extracted_text : null,
      });

      const embedding = await generateEmbedding(text);
      if (!embedding) {
        // Nema teksta za indeksiranje (prazna poseta) — preskoči, nije greška.
        continue;
      }

      const { error: updateError } = await supabase
        .from("field_visits")
        .update({ embedding })
        .eq("id", visit.id);

      if (updateError) {
        failed += 1;
        errors.push({ id: visit.id, error: updateError.message });
      } else {
        updated += 1;
      }
    } catch (e) {
      failed += 1;
      errors.push({
        id: visit.id,
        error: e instanceof Error ? e.message : "Nepoznata greška",
      });
    }
  }

  return jsonOk({
    processed: visits.length,
    updated,
    failed,
    errors: errors.slice(0, 10),
    note:
      visits.length === 200
        ? "Obrađeno je tačno 200 (limit po pozivu) — pokreni ponovo ako ih ima još."
        : undefined,
  });
});