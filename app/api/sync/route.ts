import type { SupabaseClient } from "@supabase/supabase-js";
import { getFieldMutationContext } from "@/lib/api/mutation-guards";
import { isSuperAdmin, type AuthProfile } from "@/lib/api/session";
import { isUuid } from "@/lib/api/agency-scope";
import { insertDetailedAudit } from "@/lib/api/detailed-audit";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/api/read-json";
import { withApiCatch } from "@/lib/api/with-api-catch";
import type { SyncItemResult } from "@/lib/offline/types";
import { normalizeVisitStatus } from "@/lib/field-visits/display";
import { getDelegatedFromUserIds } from "@/lib/field-visits/control-visits";
import { findSchedulingConflicts } from "@/lib/field-visits/scheduling-conflicts";
import {
  isVisitType,
  resolveVisitTypeAndParent,
} from "@/lib/field-visits/visit-type";
import { generateEmbedding, buildVisitEmbeddingText } from "@/lib/api/embeddings";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Dozvoljene tabele + kolona vlasnika + whitelist kolona koje smeju da se upišu. */
const TABLE_CONFIG: Record<
  string,
  { owner: string; cols: string[] }
> = {
  field_visits: {
    owner: "assigned_user_id",
    cols: [
      "client_company_id",
      "assigned_user_id",
      "scheduled_at",
      "started_at",
      "completed_at",
      "status",
      "sync_status",
      "offline_client_id",
      "notes",
      "metadata",
      "report_template_id",
      "hitno_otklanjanje",
      "parent_visit_id",
      "visit_type",
      // broj_naloga dodeljuje DB trigger — ne prihvata se sa klijenta
      // acknowledge_conflicts nije DB kolona — čita se iz raw data
    ],
  },
  risk_assessments: {
    owner: "assessed_by",
    cols: [
      "field_visit_id",
      "client_company_id",
      "risk_level",
      "score",
      "findings",
      "recommendations",
      "metadata",
    ],
  },
  team_messages: {
    owner: "sender_id",
    cols: ["channel_id", "body", "metadata"],
  },
  voice_recordings: {
    owner: "recorded_by",
    cols: [
      "field_visit_id",
      "client_company_id",
      "storage_path",
      "audio_url",
      "mime_type",
      "duration_seconds",
      "transcript",
      "transcript_status",
      "metadata",
    ],
  },
  documents: {
    owner: "uploaded_by",
    cols: [
      "client_company_id",
      "folder",
      "storage_path",
      "filename",
      "mime_type",
      "size_bytes",
      "metadata",
    ],
  },
};

const syncItemSchema = z.object({
  id: z.string().min(1),
  table: z.enum(
    Object.keys(TABLE_CONFIG) as [string, ...string[]],
  ),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]),
  recordId: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});

const syncBodySchema = z.object({
  items: z.array(syncItemSchema).max(200),
});

function pickColumns(
  data: Record<string, unknown>,
  cols: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    if (data[c] !== undefined) out[c] = data[c];
  }
  return out;
}

function resolveAgencyId(
  profile: AuthProfile,
  data: Record<string, unknown>,
): string | null {
  if (profile.agency_id) return profile.agency_id;
  if (isSuperAdmin(profile) && typeof data.agency_id === "string") {
    return data.agency_id;
  }
  return null;
}

/**
 * Best-effort generisanje i upis embedding-a za novokreiranu terensku posetu.
 * Ne baca grešku napolje — ako embedding ne uspe, poseta ostaje sačuvana bez
 * njega (može se naknadno dopuniti), samo se loguje greška.
 */
async function generateAndSaveVisitEmbedding(
  supabase: SupabaseClient,
  visitId: string,
  clientCompanyId: string | null | undefined,
  notes: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): Promise<void> {
  try {
    let clientName: string | null = null;
    if (clientCompanyId) {
      const { data: client } = await supabase
        .from("client_companies")
        .select("name")
        .eq("id", clientCompanyId)
        .maybeSingle();
      clientName = client?.name ?? null;
    }

    const riskLevel =
      metadata && typeof metadata.risk_level === "string"
        ? metadata.risk_level
        : null;
    const extractedText =
      metadata && typeof metadata.extracted_text === "string"
        ? metadata.extracted_text
        : null;

    const text = buildVisitEmbeddingText({
      clientName,
      notes,
      riskLevel,
      extractedText,
    });

    const embedding = await generateEmbedding(text);
    if (!embedding) return;

    const { error } = await supabase
      .from("field_visits")
      .update({ embedding })
      .eq("id", visitId);

    if (error) {
      console.error("[sync] embedding upis nije uspeo", visitId, error.message);
    }
  } catch (e) {
    console.error(
      "[sync] embedding generisanje nije uspelo",
      visitId,
      e instanceof Error ? e.message : e,
    );
  }
}

export const POST = withApiCatch(async (request: Request) => {
  const guard = await getFieldMutationContext();
  if (!guard.ok) return guard.response;
  const { profile, supabase, user } = guard.ctx;

  const raw = await readJsonBody(request, 2 * 1024 * 1024);
  if (!raw.ok) return raw.response;

  const parsed = syncBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return jsonError("Validacija nije uspela.", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const results: SyncItemResult[] = [];
  // Embedding pozivi se odlažu i izvršavaju posle glavne petlje (ne blokiraju
  // odgovor korisniku — sync ostaje brz, embedding stiže koji čas kasnije).
  const embeddingJobs: Array<() => Promise<void>> = [];

  for (const item of parsed.data.items) {
    const config = TABLE_CONFIG[item.table];
    try {
      if (item.action === "DELETE") {
        const result = await handleDelete(supabase, profile, item.table, item.recordId);
        results.push({ id: item.id, ...result });
        continue;
      }

      const agencyId = resolveAgencyId(profile, item.data);
      if (!agencyId) {
        results.push({
          id: item.id,
          ok: false,
          error: "Niste dodeljeni agenciji.",
          code: "FORBIDDEN",
        });
        continue;
      }

      const payload = pickColumns(item.data, config.cols);

      if (item.action === "INSERT") {
        const insertPayload = { ...payload };
        if (item.table === "field_visits") {
          const raw = item.data as Record<string, unknown>;
          const scheduled =
            (typeof raw.scheduled_at === "string" && raw.scheduled_at) ||
            (typeof raw.visit_date === "string" && raw.visit_date) ||
            new Date().toISOString();
          insertPayload.scheduled_at = scheduled;
          insertPayload.sync_status = "synced";
          if (typeof raw.assigned_user_id === "string") {
            insertPayload.assigned_user_id = raw.assigned_user_id;
          } else if (typeof raw.assigned_to === "string") {
            insertPayload.assigned_user_id = raw.assigned_to;
          }
          const meta =
            insertPayload.metadata &&
            typeof insertPayload.metadata === "object" &&
            !Array.isArray(insertPayload.metadata)
              ? (insertPayload.metadata as Record<string, unknown>)
              : {};
          const notesFromRaw =
            typeof raw.notes === "string" && raw.notes.trim()
              ? raw.notes.trim()
              : typeof meta.notes === "string" && meta.notes.trim()
                ? meta.notes.trim()
                : null;
          if (notesFromRaw) {
            insertPayload.notes = notesFromRaw;
            delete meta.notes;
          }
          // Ne upisuj apsurdno trajanje (npr. sekunde snimka kao duration_hours).
          const durationRaw = meta.duration_hours;
          const durationNum =
            typeof durationRaw === "number"
              ? durationRaw
              : typeof durationRaw === "string"
                ? Number(durationRaw)
                : NaN;
          if (
            !Number.isFinite(durationNum) ||
            durationNum <= 0 ||
            durationNum > 24
          ) {
            delete meta.duration_hours;
          } else {
            meta.duration_hours = durationNum;
          }
          if (item.recordId && !insertPayload.offline_client_id) {
            insertPayload.offline_client_id = item.recordId;
          }
          insertPayload.metadata = meta;
          insertPayload.status = normalizeVisitStatus(
            typeof insertPayload.status === "string"
              ? insertPayload.status
              : typeof raw.status === "string"
                ? raw.status
                : undefined,
          );
          insertPayload.hitno_otklanjanje = raw.hitno_otklanjanje === true;

          const typeResolved = resolveVisitTypeAndParent({
            visitType: isVisitType(raw.visit_type) ? raw.visit_type : undefined,
            parentVisitId:
              typeof raw.parent_visit_id === "string"
                ? raw.parent_visit_id
                : null,
          });
          if (!typeResolved.ok) {
            results.push({
              id: item.id,
              ok: false,
              error: typeResolved.message,
              code: "VALIDATION_ERROR",
            });
            continue;
          }
          insertPayload.visit_type = typeResolved.visit_type;

          if (typeResolved.parent_visit_id) {
            const parentId = typeResolved.parent_visit_id;
            const { data: parent } = await supabase
              .from("field_visits")
              .select("id, agency_id, assigned_user_id")
              .eq("id", parentId)
              .maybeSingle();
            if (!parent || parent.agency_id !== agencyId) {
              results.push({
                id: item.id,
                ok: false,
                error: "Originalna poseta nije pronađena.",
                code: "NOT_FOUND",
              });
              continue;
            }
            if (!isSuperAdmin(profile)) {
              const delegatedFrom = await getDelegatedFromUserIds(
                supabase,
                agencyId,
                user.id,
              );
              const allowed = new Set([user.id, ...delegatedFrom]);
              if (
                !parent.assigned_user_id ||
                !allowed.has(parent.assigned_user_id)
              ) {
                results.push({
                  id: item.id,
                  ok: false,
                  error:
                    "Nemaš pravo da kreiraš kontrolnu posetu za taj nalog.",
                  code: "FORBIDDEN",
                });
                continue;
              }
            }
            insertPayload.parent_visit_id = parentId;
          } else {
            delete insertPayload.parent_visit_id;
          }

          const assignedForConflict =
            (typeof insertPayload.assigned_user_id === "string"
              ? insertPayload.assigned_user_id
              : null) ?? user.id;
          const durationForConflict =
            typeof meta.duration_hours === "number"
              ? meta.duration_hours
              : null;
          if (raw.acknowledge_conflicts !== true) {
            const conflicts = await findSchedulingConflicts(supabase, {
              agencyId,
              clientCompanyId: String(insertPayload.client_company_id ?? ""),
              assignedUserId: assignedForConflict,
              scheduledAt: String(insertPayload.scheduled_at),
              durationHours: durationForConflict,
            });
            if (conflicts.has_conflicts) {
              results.push({
                id: item.id,
                ok: false,
                error:
                  "Pronađen je konflikt u rasporedu. Potvrdi zakazivanje ili izmeni termin.",
                code: "SCHEDULING_CONFLICT",
              });
              continue;
            }
          }

          // broj_naloga uvek dodeljuje DB trigger (N/YY ili N-k/YY)
          delete insertPayload.broj_naloga;
          delete insertPayload.acknowledge_conflicts;
        }
        const row: Record<string, unknown> = {
          ...insertPayload,
          agency_id: agencyId,
        };
        if (config.owner && row[config.owner] == null) {
          row[config.owner] = user.id;
        }
        const { data, error } = await supabase
          .from(item.table)
          .insert(row)
          .select("id")
          .single();
        if (error) {
          results.push({
            id: item.id,
            ok: false,
            error: error.message,
            code: "DATABASE_ERROR",
          });
          continue;
        }
        await insertDetailedAudit(supabase, {
          agency_id: agencyId,
          actor_user_id: user.id,
          action: `${item.table}.synced_insert`,
          entity_type: item.table,
          entity_id: data.id,
          metadata: { offline_id: item.recordId },
        });

        // Zakaži generisanje embedding-a za novu terensku posetu (best-effort).
        if (item.table === "field_visits") {
          const visitId = data.id as string;
          const clientCompanyId =
            typeof row.client_company_id === "string"
              ? row.client_company_id
              : null;
          const notes = typeof row.notes === "string" ? row.notes : null;
          const metadata =
            row.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, unknown>)
              : null;
          embeddingJobs.push(() =>
            generateAndSaveVisitEmbedding(
              supabase,
              visitId,
              clientCompanyId,
              notes,
              metadata,
            ),
          );
        }

        results.push({ id: item.id, ok: true, serverId: data.id });
        continue;
      }

      // UPDATE
      if (!isUuid(item.recordId)) {
        results.push({
          id: item.id,
          ok: false,
          error: "UPDATE zahteva server UUID.",
          code: "INVALID_ID",
        });
        continue;
      }
      const { error } = await supabase
        .from(item.table)
        .update(payload)
        .eq("id", item.recordId)
        .eq("agency_id", agencyId);
      if (error) {
        results.push({
          id: item.id,
          ok: false,
          error: error.message,
          code: "DATABASE_ERROR",
        });
        continue;
      }
      results.push({ id: item.id, ok: true, serverId: item.recordId });
    } catch (e) {
      results.push({
        id: item.id,
        ok: false,
        error: e instanceof Error ? e.message : "Greška",
        code: "INTERNAL_ERROR",
      });
    }
  }

  // Izvršava embedding poslove posle upisa svih stavki — odgovor korisniku
  // ide odmah, embedding stiže u pozadini (nekoliko sekundi kasnije).
  if (embeddingJobs.length > 0) {
    void Promise.all(embeddingJobs.map((job) => job()));
  }

  return jsonOk({ results });
});

async function handleDelete(
  supabase: SupabaseClient,
  profile: AuthProfile,
  table: string,
  recordId: string,
): Promise<{ ok: boolean; error?: string; code?: string; serverId?: string }> {
  if (!isUuid(recordId)) {
    // Lokalni zapis koji nikad nije sinhronizovan — tretiraj kao uspeh.
    return { ok: true };
  }
  let query = supabase.from(table).delete().eq("id", recordId);
  if (profile.agency_id) {
    query = query.eq("agency_id", profile.agency_id);
  }
  const { error } = await query;
  if (error) {
    return { ok: false, error: error.message, code: "DATABASE_ERROR" };
  }
  return { ok: true, serverId: recordId };
}