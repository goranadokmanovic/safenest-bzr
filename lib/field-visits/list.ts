import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameFromPhotoUrl } from "@/lib/api/photo-storage";
import type { FieldVisitMetadata } from "@/lib/field-visits/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type FieldVisitListScope = "mine" | "all";

/** Predstojeće vs istorija — ortogonalno na Moje/Sve. */
export type FieldVisitListTime = "upcoming" | "history";

export type FieldVisitListFilters = {
  scope: FieldVisitListScope;
  /** Podrazumevano upcoming. */
  time?: FieldVisitListTime;
  /** Tekstualna pretraga naziva klijenta (client_companies.name). */
  clientName?: string;
  /** Delatnost klijenta — client_companies.activity_sector. */
  industry?: string;
  /** metadata.risk_level: low | medium | high */
  riskLevel?: "low" | "medium" | "high";
  /** scheduled_at >= YYYY-MM-DD (početak dana, UTC lokalno kao date string) */
  dateFrom?: string;
  /** scheduled_at <= kraj dana dateTo */
  dateTo?: string;
  /** Filter radnika (samo scope=all). */
  assignedUserId?: string;
  reportLockStatus?: "in_progress" | "closed";
  /** Tekstualna pretraga broja naloga (npr. 12/26). */
  brojNaloga?: string;
  /** true/false; undefined = bez filtera */
  hitnoOtklanjanje?: boolean;
};

export type FieldVisitListPhoto = {
  id: string;
  url: string;
  label: string;
  ocr_text: string | null;
  ocr_confidence: number | null;
  extracted_dates: Record<string, unknown> | null;
};

export type FieldVisitListRow = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  /** client_companies.activity_sector — samo za prikaz. */
  client_industry: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  sync_status: string;
  notes: string | null;
  metadata: FieldVisitMetadata;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  audio_url: string | null;
  transcript: string | null;
  transcript_status: "pending" | "processing" | "done" | "failed";
  noise_mode: "quiet" | "noisy" | null;
  report_template_id: string | null;
  report: string | null;
  report_fields: Record<string, string> | null;
  report_status: "pending" | "processing" | "done" | "failed" | "skipped";
  report_lock_status: "in_progress" | "closed";
  report_closed_at: string | null;
  reopen_requested_at: string | null;
  reopen_justification: string | null;
  reopen_approved_at: string | null;
  signature_statement: string | null;
  report_content_hash: string | null;
  broj_naloga: string | null;
  hitno_otklanjanje: boolean;
  parent_visit_id: string | null;
  parent_broj_naloga: string | null;
  photos: FieldVisitListPhoto[];
  photo_count: number;
};

export type AgencyWorkerOption = {
  user_id: string;
  full_name: string;
  email: string;
};

const LIST_SELECT = `
  id,
  client_company_id,
  scheduled_at,
  started_at,
  completed_at,
  status,
  sync_status,
  notes,
  metadata,
  assigned_user_id,
  audio_url,
  transcript,
  transcript_status,
  noise_mode,
  report_template_id,
  report,
  report_fields,
  report_status,
  report_lock_status,
  report_closed_at,
  reopen_requested_at,
  reopen_justification,
  reopen_approved_at,
  signature_statement,
  report_content_hash,
  broj_naloga,
  hitno_otklanjanje,
  parent_visit_id,
  client_companies ( name, activity_sector )
`;

function sanitizeIlike(raw: string): string {
  return raw.replace(/%/g, "").replace(/,/g, "").trim();
}

function endOfDayIso(dateOnly: string): string {
  // dateOnly = YYYY-MM-DD → inclusive end of that calendar day (UTC)
  return `${dateOnly}T23:59:59.999Z`;
}

function startOfDayIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

/**
 * Predstojeća poseta: scheduled_at u budućnosti (ili sada) i nije
 * completed/cancelled. Zakasneli nacrti idu u istoriju.
 */
export function isUpcomingFieldVisit(
  scheduledAt: string,
  status: string,
  nowMs: number = Date.now(),
): boolean {
  const normalized =
    status === "scheduled" ? "draft" : String(status ?? "").toLowerCase();
  if (normalized === "completed" || normalized === "cancelled") return false;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= nowMs;
}

/** Deep-link sa kalendara / spoljnih linkova → lista + auto-open modal. */
export function fieldVisitsListHref(input: {
  visitId: string;
  scheduledAt: string;
  status: string;
  basePath?: string;
  /** Poreklo linka — koristi se za dugme Nazad (npr. kalendar). */
  from?: "zakazivanje";
}): string {
  const time: FieldVisitListTime = isUpcomingFieldVisit(
    input.scheduledAt,
    input.status,
  )
    ? "upcoming"
    : "history";
  const params = new URLSearchParams({
    visit: input.visitId,
    scope: "all",
    time,
  });
  if (input.from) params.set("from", input.from);
  return `${input.basePath ?? "/agencija/field-visits"}?${params.toString()}`;
}

/** Resolve return path for visit deep-links (`?from=`). */
export function fieldVisitReturnHref(
  from: string | null | undefined,
): string | null {
  if (from === "zakazivanje") return "/agencija/zakazivanje";
  return null;
}

/**
 * Lista terenskih poseta sa tab scope + AND filterima.
 * Napomena: risk_level živi u metadata (nije top-level kolona).
 * Delatnost = client_companies.activity_sector.
 * broj_naloga / hitno_otklanjanje — kolone na field_visits.
 */
export async function listFieldVisitsForAgency(
  supabase: SupabaseClient,
  agencyId: string,
  currentUserId: string,
  filters: FieldVisitListFilters,
  limit = 500,
): Promise<{ rows: FieldVisitListRow[]; error: string | null }> {
  let clientIds: string[] | null = null;

  const clientName = filters.clientName
    ? sanitizeIlike(filters.clientName)
    : "";
  const industry = filters.industry ? sanitizeIlike(filters.industry) : "";

  if (clientName || industry) {
    let clientsQuery = supabase
      .from("client_companies")
      .select("id")
      .eq("agency_id", agencyId);

    if (clientName) {
      clientsQuery = clientsQuery.ilike("name", `%${clientName}%`);
    }
    if (industry) {
      clientsQuery = clientsQuery.ilike("activity_sector", `%${industry}%`);
    }

    const { data: clients, error: clientsErr } = await clientsQuery;
    if (clientsErr) {
      return { rows: [], error: clientsErr.message };
    }
    clientIds = (clients ?? []).map((c) => c.id);
    if (clientIds.length === 0) {
      return { rows: [], error: null };
    }
  }

  const time: FieldVisitListTime = filters.time === "history" ? "history" : "upcoming";
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("field_visits")
    .select(LIST_SELECT)
    .eq("agency_id", agencyId)
    .order("scheduled_at", { ascending: time === "upcoming" })
    .limit(limit);

  if (time === "upcoming") {
    // Budućnost + nije završeno/otkazano.
    query = query
      .gte("scheduled_at", nowIso)
      .not("status", "in", '("completed","cancelled")');
  } else {
    // Prošlost ili završeno/otkazano (uključujući zakasnele nacrte).
    // Navodnici oko ISO — inače `:` u timestamp-u lomi PostgREST or-filter.
    query = query.or(
      `scheduled_at.lt."${nowIso}",status.in.("completed","cancelled")`,
    );
  }

  if (filters.scope === "mine") {
    const { data: collabRows } = await supabase
      .from("field_visit_collaborators")
      .select("field_visit_id")
      .eq("user_id", currentUserId);
    const collabIds = [
      ...new Set(
        (collabRows ?? [])
          .map((r) => r.field_visit_id as string)
          .filter(Boolean),
      ),
    ];
    if (collabIds.length > 0) {
      // Primarni ILI saradnik
      query = query.or(
        `assigned_user_id.eq.${currentUserId},id.in.(${collabIds.join(",")})`,
      );
    } else {
      query = query.eq("assigned_user_id", currentUserId);
    }
  } else if (filters.assignedUserId) {
    query = query.eq("assigned_user_id", filters.assignedUserId);
  }

  if (clientIds) {
    query = query.in("client_company_id", clientIds);
  }

  if (filters.riskLevel) {
    query = query.contains("metadata", { risk_level: filters.riskLevel });
  }

  if (filters.dateFrom) {
    query = query.gte("scheduled_at", startOfDayIso(filters.dateFrom));
  }
  if (filters.dateTo) {
    query = query.lte("scheduled_at", endOfDayIso(filters.dateTo));
  }

  if (filters.reportLockStatus) {
    query = query.eq("report_lock_status", filters.reportLockStatus);
  }

  if (filters.brojNaloga) {
    const bn = sanitizeIlike(filters.brojNaloga);
    if (bn) {
      query = query.ilike("broj_naloga", `%${bn}%`);
    }
  }

  if (filters.hitnoOtklanjanje === true) {
    query = query.eq("hitno_otklanjanje", true);
  } else if (filters.hitnoOtklanjanje === false) {
    query = query.eq("hitno_otklanjanje", false);
  }

  const { data, error } = await query;
  if (error) {
    return { rows: [], error: error.message };
  }

  const assignedIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.assigned_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const assigneeNames = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: assignees } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", assignedIds);
    for (const p of assignees ?? []) {
      if (p.full_name?.trim()) {
        assigneeNames.set(p.user_id, p.full_name.trim());
      }
    }
  }

  let rows: FieldVisitListRow[] = (data ?? []).map((row) => {
    const cc = row.client_companies as
      | { name?: string; activity_sector?: string | null }
      | { name?: string; activity_sector?: string | null }[]
      | null;
    const name = Array.isArray(cc) ? (cc[0]?.name ?? null) : (cc?.name ?? null);
    const industry = Array.isArray(cc)
      ? (cc[0]?.activity_sector ?? null)
      : (cc?.activity_sector ?? null);
    const scheduled = (row.scheduled_at as string | null) ?? new Date().toISOString();

    return {
      id: row.id as string,
      client_company_id: row.client_company_id as string,
      client_name: name,
      client_industry: industry?.trim() ? industry.trim() : null,
      scheduled_at: scheduled,
      started_at: (row.started_at as string | null) ?? null,
      completed_at: (row.completed_at as string | null) ?? null,
      status: row.status as string,
      sync_status: (row.sync_status as string | null) ?? "pending",
      notes: (row.notes as string | null) ?? null,
      metadata: (row.metadata ?? {}) as FieldVisitMetadata,
      assigned_user_id: (row.assigned_user_id as string | null) ?? null,
      assigned_user_name: row.assigned_user_id
        ? (assigneeNames.get(row.assigned_user_id as string) ?? null)
        : null,
      audio_url: (row.audio_url as string | null) ?? null,
      transcript: (row.transcript as string | null) ?? null,
      transcript_status:
        row.transcript_status === "processing" ||
        row.transcript_status === "done" ||
        row.transcript_status === "failed"
          ? row.transcript_status
          : "pending",
      noise_mode:
        row.noise_mode === "quiet" || row.noise_mode === "noisy"
          ? row.noise_mode
          : null,
      report_template_id: (row.report_template_id as string | null) ?? null,
      report: (row.report as string | null) ?? null,
      report_fields:
        row.report_fields &&
        typeof row.report_fields === "object" &&
        !Array.isArray(row.report_fields)
          ? (row.report_fields as Record<string, string>)
          : null,
      report_status:
        row.report_status === "processing" ||
        row.report_status === "done" ||
        row.report_status === "failed" ||
        row.report_status === "skipped"
          ? row.report_status
          : "pending",
      report_lock_status:
        row.report_lock_status === "closed" ? "closed" : "in_progress",
      report_closed_at: (row.report_closed_at as string | null) ?? null,
      reopen_requested_at: (row.reopen_requested_at as string | null) ?? null,
      reopen_justification:
        (row.reopen_justification as string | null) ?? null,
      reopen_approved_at: (row.reopen_approved_at as string | null) ?? null,
      signature_statement:
        typeof row.signature_statement === "string" &&
        row.signature_statement.trim()
          ? row.signature_statement.trim()
          : null,
      report_content_hash:
        typeof row.report_content_hash === "string" &&
        row.report_content_hash.trim()
          ? row.report_content_hash.trim()
          : null,
      broj_naloga: (row.broj_naloga as string | null) ?? null,
      hitno_otklanjanje: row.hitno_otklanjanje === true,
      parent_visit_id: (row.parent_visit_id as string | null) ?? null,
      parent_broj_naloga: null,
      photos: [],
      photo_count: 0,
    };
  });

  const parentIds = [
    ...new Set(
      rows
        .map((r) => r.parent_visit_id)
        .filter((id): id is string => !!id),
    ),
  ];
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("field_visits")
      .select("id, broj_naloga")
      .in("id", parentIds);
    const parentBroj = new Map<string, string>();
    for (const p of parents ?? []) {
      if (p.broj_naloga) parentBroj.set(p.id, p.broj_naloga);
    }
    rows = rows.map((r) => ({
      ...r,
      parent_broj_naloga: r.parent_visit_id
        ? (parentBroj.get(r.parent_visit_id) ?? null)
        : null,
    }));
  }

  const visitIds = rows.map((v) => v.id);
  if (visitIds.length > 0) {
    const { data: photoRows, error: photoErr } = await supabase
      .from("field_photos")
      .select(
        "id, field_visit_id, photo_url, extracted_dates, ocr_confidence, ocr_text, created_at",
      )
      .in("field_visit_id", visitIds)
      .order("created_at", { ascending: true });

    if (photoErr) {
      return { rows: [], error: photoErr.message };
    }

    const photosByVisit = new Map<string, NonNullable<typeof photoRows>>();
    for (const p of photoRows ?? []) {
      const list = photosByVisit.get(p.field_visit_id) ?? [];
      list.push(p);
      photosByVisit.set(p.field_visit_id, list);
    }

    rows = rows.map((visit) => {
      const visitPhotos = photosByVisit.get(visit.id) ?? [];
      const photos = visitPhotos.map((p) => ({
        id: p.id,
        url: p.photo_url,
        label: displayNameFromPhotoUrl(p.photo_url, p.id),
        ocr_text: p.ocr_text ?? null,
        ocr_confidence: p.ocr_confidence ?? null,
        extracted_dates:
          (p.extracted_dates as Record<string, unknown> | null) ?? null,
      }));
      return {
        ...visit,
        photos,
        photo_count: visitPhotos.length,
      };
    });
  }

  return { rows, error: null };
}

export async function listAgencyWorkers(
  supabase: SupabaseClient,
  agencyId: string,
  options?: {
    /** Podrazumevano: owner + collaborator + field_worker. */
    roles?: Array<"agency_owner" | "agency_collaborator" | "field_worker">;
  },
): Promise<AgencyWorkerOption[]> {
  const roles = options?.roles ?? [
    "agency_owner",
    "agency_collaborator",
    "field_worker",
  ];

  // Service role — profiles RLS bez peers politike inače vraća samo sebe
  // (prazan „Izaberi kolegu…” dropdown). Fallback na user klijent.
  let client = supabase;
  try {
    client = createAdminSupabaseClient();
  } catch {
    /* nema service role u env — koristi prosleđeni klijent */
  }

  const { data } = await client
    .from("profiles")
    .select("user_id, full_name, email, role")
    .eq("agency_id", agencyId)
    .in("role", roles)
    .order("full_name", { ascending: true });

  return (data ?? []).map((p) => ({
    user_id: p.user_id,
    full_name: p.full_name?.trim() || p.email || p.user_id.slice(0, 8),
    email: p.email ?? "",
  }));
}

/** Samo terenski saradnici — za delegacije naloga (bez agency_owner). */
export async function listAgencyCollaborators(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<AgencyWorkerOption[]> {
  // 1) profiles.role = agency_collaborator
  const fromProfiles = await listAgencyWorkers(supabase, agencyId, {
    roles: ["agency_collaborator"],
  });

  // 2) Dopuna iz agency_members (member_role=collaborator) ako profiles RLS/role odstupa
  const { data: members } = await supabase
    .from("agency_members")
    .select(
      "user_id, member_role, profiles:user_id (user_id, full_name, email, role)",
    )
    .eq("agency_id", agencyId)
    .eq("member_role", "collaborator");

  const byId = new Map<string, AgencyWorkerOption>();
  for (const w of fromProfiles) {
    byId.set(w.user_id, w);
  }

  for (const m of members ?? []) {
    const uid = m.user_id as string;
    if (byId.has(uid)) continue;
    const p = m.profiles as
      | { user_id?: string; full_name?: string; email?: string; role?: string }
      | { user_id?: string; full_name?: string; email?: string; role?: string }[]
      | null;
    const profile = Array.isArray(p) ? p[0] : p;
    // Ne uključuj owner profil čak i ako je članstvo collaborator (nekonzistentnost)
    if (profile?.role === "agency_owner") continue;
    byId.set(uid, {
      user_id: uid,
      full_name:
        profile?.full_name?.trim() ||
        profile?.email ||
        uid.slice(0, 8),
      email: profile?.email ?? "",
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "sr"),
  );
}

export function parseFieldVisitListFilters(
  searchParams: URLSearchParams,
): FieldVisitListFilters {
  const scopeRaw = searchParams.get("scope");
  const scope: FieldVisitListScope =
    scopeRaw === "all" ? "all" : "mine";

  const riskRaw = searchParams.get("risk_level");
  const riskLevel =
    riskRaw === "low" || riskRaw === "medium" || riskRaw === "high"
      ? riskRaw
      : undefined;

  const lockRaw = searchParams.get("report_lock_status");
  const reportLockStatus =
    lockRaw === "in_progress" || lockRaw === "closed" ? lockRaw : undefined;

  const dateFrom = searchParams.get("date_from")?.trim() || undefined;
  const dateTo = searchParams.get("date_to")?.trim() || undefined;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  const hitnoRaw = searchParams.get("hitno_otklanjanje");
  const hitnoOtklanjanje =
    hitnoRaw === "1" || hitnoRaw === "true"
      ? true
      : hitnoRaw === "0" || hitnoRaw === "false"
        ? false
        : undefined;

  const timeRaw = searchParams.get("time");
  const time: FieldVisitListTime =
    timeRaw === "history" ? "history" : "upcoming";

  return {
    scope,
    time,
    clientName: searchParams.get("client_name")?.trim() || undefined,
    industry: searchParams.get("industry")?.trim() || undefined,
    riskLevel,
    dateFrom: dateFrom && dateRe.test(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && dateRe.test(dateTo) ? dateTo : undefined,
    assignedUserId:
      scope === "all"
        ? searchParams.get("assigned_user_id")?.trim() || undefined
        : undefined,
    reportLockStatus,
    brojNaloga: searchParams.get("broj_naloga")?.trim() || undefined,
    hitnoOtklanjanje,
  };
}
