import {
  canReadAgencyRecords,
  getAuthContext,
  isClientPortalUser,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  getDelegatedFromUserIds,
  previewControlBrojNaloga,
} from "@/lib/field-visits/control-visits";
import { isUuid } from "@/lib/api/agency-scope";

/**
 * Kandidati za "Kontrolna poseta za nalog":
 * sopstvene posete + posete radnika sa aktivnom delegacijom ka trenutnom korisniku.
 * Owner ima istu restrikciju (samo svoje + delegirane) radi konzistentnosti.
 */
export const GET = withApiCatch(async (request: Request) => {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { profile, supabase, user } = auth.ctx;

  if (isClientPortalUser(profile)) {
    return jsonError("Nedozvoljena ruta za klijentski nalog.", 403, {
      code: "FORBIDDEN",
    });
  }
  if (!canReadAgencyRecords(profile) || !profile.agency_id) {
    return jsonError("Niste dodeljeni agenciji.", 403, { code: "FORBIDDEN" });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().replace(/%/g, "");
  const previewParent = url.searchParams.get("preview_parent_id")?.trim();

  if (previewParent) {
    if (!isUuid(previewParent)) {
      return jsonError("Nevažeći parent id.", 400, { code: "INVALID_ID" });
    }
    const preview = await previewControlBrojNaloga(
      supabase,
      profile.agency_id,
      previewParent,
    );
    if (!preview) {
      return jsonError("Poseta nije pronađena.", 404, { code: "NOT_FOUND" });
    }
    return jsonOk({ preview });
  }

  const delegatedFrom = await getDelegatedFromUserIds(
    supabase,
    profile.agency_id,
    user.id,
  );
  const allowedUserIds = [user.id, ...delegatedFrom];

  let query = supabase
    .from("field_visits")
    .select(
      `
      id,
      broj_naloga,
      scheduled_at,
      assigned_user_id,
      parent_visit_id,
      client_companies ( name )
    `,
    )
    .eq("agency_id", profile.agency_id)
    .in("assigned_user_id", allowedUserIds)
    .order("scheduled_at", { ascending: false })
    .limit(40);

  if (q.length >= 1) {
    // Pretraga po broju naloga; ime klijenta filtriramo posle (join ilike je nestabilan)
    query = query.ilike("broj_naloga", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return jsonError(error.message, 400, { code: "DATABASE_ERROR" });
  }

  let rows = data ?? [];

  // Ako nema pogodaka po broju, pokušaj po imenu klijenta (samo dozvoljeni radnici)
  if (q.length >= 2 && rows.length === 0) {
    const { data: clients } = await supabase
      .from("client_companies")
      .select("id")
      .eq("agency_id", profile.agency_id)
      .ilike("name", `%${q}%`)
      .limit(30);
    const clientIds = (clients ?? []).map((c) => c.id);
    if (clientIds.length > 0) {
      const { data: byClient, error: byClientErr } = await supabase
        .from("field_visits")
        .select(
          `
          id,
          broj_naloga,
          scheduled_at,
          assigned_user_id,
          parent_visit_id,
          client_companies ( name )
        `,
        )
        .eq("agency_id", profile.agency_id)
        .in("assigned_user_id", allowedUserIds)
        .in("client_company_id", clientIds)
        .order("scheduled_at", { ascending: false })
        .limit(40);
      if (byClientErr) {
        return jsonError(byClientErr.message, 400, { code: "DATABASE_ERROR" });
      }
      rows = byClient ?? [];
    }
  }

  const assigneeIds = [
    ...new Set(
      rows
        .map((r) => r.assigned_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", assigneeIds);
    for (const p of profiles ?? []) {
      names.set(
        p.user_id,
        p.full_name?.trim() || p.email || p.user_id.slice(0, 8),
      );
    }
  }

  const candidates = rows.map((row) => {
    const cc = row.client_companies as
      | { name?: string }
      | { name?: string }[]
      | null;
    const clientName = Array.isArray(cc)
      ? (cc[0]?.name ?? null)
      : (cc?.name ?? null);
    const assignedId = row.assigned_user_id as string | null;
    const isDelegated = !!assignedId && assignedId !== user.id;

    return {
      id: row.id as string,
      broj_naloga: row.broj_naloga as string,
      scheduled_at: row.scheduled_at as string | null,
      client_name: clientName,
      assigned_user_id: assignedId,
      assigned_user_name: assignedId ? (names.get(assignedId) ?? null) : null,
      is_delegated: isDelegated,
      is_control: row.parent_visit_id != null,
    };
  });

  return jsonOk({ candidates });
});
