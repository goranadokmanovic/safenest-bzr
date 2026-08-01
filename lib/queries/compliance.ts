/**
 * Deljene read funkcije nad compliance zapisima (primarni izvor „rokova”).
 * Tabela `deadlines` je zaseban, stariji mehanizam i ovde se namerno ne dira.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getComplianceStatus,
  todayBelgradeIso,
  type ComplianceRecordType,
  type ComplianceStatusKind,
} from "@/lib/compliance/types";
import type { QueryResult } from "@/lib/queries/clients";

export type ComplianceRecordMatch = {
  id: string;
  client_company_id: string;
  client_name: string | null;
  subject_name: string;
  category: string;
  record_type: ComplianceRecordType;
  expiry_date: string | null;
};

export type LookupComplianceRecordsInput = {
  agencyId: string;
  clientCompanyId: string;
  subjectName: string;
  category?: string | null;
  recordType?: ComplianceRecordType | null;
};

export type UpcomingDeadline = {
  record_id: string;
  client_company_id: string;
  client_name: string | null;
  record_type: ComplianceRecordType;
  category: string;
  subject_name: string;
  expiry_date: string;
  days_remaining: number;
  status: ComplianceStatusKind;
};

export type UpcomingDeadlinesInput = {
  agencyId: string;
  /** Opseg korisnika; null = bez sužavanja (owner / field_worker / super_admin). */
  clientIds: string[] | null;
  days: number;
  clientCompanyId?: string | null;
  includeExpired?: boolean;
  todayIso?: string;
  limit?: number;
};

export type UpcomingDeadlinesResult = {
  deadlines: UpcomingDeadline[];
  truncated: boolean;
};

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Traži compliance zapise jednog klijenta po imenu subjekta (+ opciono
 * kategorija / tip). Vraća kandidate za razrešavanje u AI alatu — bez upisa.
 */
export async function lookupComplianceRecords(
  supabase: SupabaseClient,
  input: LookupComplianceRecordsInput,
): Promise<QueryResult<ComplianceRecordMatch[]>> {
  const needle = input.subjectName.trim().toLowerCase();
  if (needle.length < 2) {
    return { ok: true, value: [] };
  }

  let query = supabase
    .from("compliance_records")
    .select(
      "id, client_company_id, record_type, category, subject_name, expiry_date, client_companies ( name )",
    )
    .eq("agency_id", input.agencyId)
    .eq("client_company_id", input.clientCompanyId)
    .order("expiry_date", { ascending: false })
    .limit(200);

  if (input.recordType) {
    query = query.eq("record_type", input.recordType);
  }

  const { data, error } = await query;
  if (error) return { ok: false, message: error.message };

  const categoryNeedle = input.category?.trim().toLowerCase() ?? "";

  const matches: ComplianceRecordMatch[] = [];
  for (const row of data ?? []) {
    const subject = String(row.subject_name ?? "")
      .trim()
      .toLowerCase();
    if (!subject.includes(needle) && !needle.includes(subject)) continue;

    const category = String(row.category ?? "");
    if (
      categoryNeedle &&
      !category.toLowerCase().includes(categoryNeedle) &&
      !categoryNeedle.includes(category.toLowerCase())
    ) {
      continue;
    }

    const cc = row.client_companies as
      | { name?: string }
      | { name?: string }[]
      | null;
    const clientName = Array.isArray(cc)
      ? (cc[0]?.name ?? null)
      : (cc?.name ?? null);

    matches.push({
      id: row.id as string,
      client_company_id: row.client_company_id as string,
      client_name: clientName,
      subject_name: String(row.subject_name ?? ""),
      category,
      record_type: row.record_type as ComplianceRecordType,
      expiry_date: (row.expiry_date as string | null) ?? null,
    });
  }

  // Tačan pogodak imena ima prednost nad contains.
  const exact = matches.filter(
    (m) => m.subject_name.trim().toLowerCase() === needle,
  );
  return { ok: true, value: exact.length > 0 ? exact : matches };
}

/** Rokovi koji ističu u narednih N dana (opciono i već istekli). */
export async function listUpcomingComplianceDeadlines(
  supabase: SupabaseClient,
  input: UpcomingDeadlinesInput,
): Promise<QueryResult<UpcomingDeadlinesResult>> {
  const todayIso = input.todayIso ?? todayBelgradeIso();
  const limit = input.limit ?? 50;
  const until = addDaysIso(todayIso, Math.max(1, input.days));

  let query = supabase
    .from("compliance_records")
    .select(
      "id, client_company_id, record_type, category, subject_name, expiry_date, client_companies ( name )",
    )
    .eq("agency_id", input.agencyId)
    .not("expiry_date", "is", null)
    .lte("expiry_date", until)
    .order("expiry_date", { ascending: true })
    .limit(limit + 1);

  if (!input.includeExpired) {
    query = query.gte("expiry_date", todayIso);
  }

  if (input.clientCompanyId) {
    query = query.eq("client_company_id", input.clientCompanyId);
  } else if (input.clientIds !== null) {
    query = query.in("client_company_id", input.clientIds);
  }

  const { data, error } = await query;
  if (error) return { ok: false, message: error.message };

  const rows = data ?? [];
  const truncated = rows.length > limit;

  const deadlines = rows.slice(0, limit).map((row) => {
    const cc = row.client_companies as
      | { name?: string }
      | { name?: string }[]
      | null;
    const clientName = Array.isArray(cc)
      ? (cc[0]?.name ?? null)
      : (cc?.name ?? null);
    const expiry = row.expiry_date as string;
    const status = getComplianceStatus(expiry, todayIso);

    return {
      record_id: row.id as string,
      client_company_id: row.client_company_id as string,
      client_name: clientName,
      record_type: row.record_type as ComplianceRecordType,
      category: row.category as string,
      subject_name: row.subject_name as string,
      expiry_date: expiry,
      days_remaining: status.daysRemaining ?? 0,
      status: status.kind,
    };
  });

  return { ok: true, value: { deadlines, truncated } };
}

export type EmployeeWithoutRecords = {
  employee_id: string;
  full_name: string;
  position: string | null;
  client_company_id: string;
  client_name: string | null;
};

export type EmployeesWithoutRecordsInput = {
  agencyId: string;
  clientIds: string[] | null;
  clientCompanyId?: string | null;
  /** Ako je zadat, traže se radnici bez zapisa baš tog tipa. */
  recordType?: ComplianceRecordType | null;
  limit?: number;
};

export type EmployeesWithoutRecordsResult = {
  employees: EmployeeWithoutRecords[];
  checked_employees: number;
  truncated: boolean;
};

/**
 * Radnici klijenta (tabela `employees`) koji nemaju nijedan compliance zapis.
 * Poklapanje ide primarno po `compliance_records.subject_id`, uz rezervu na
 * normalizovano ime — `subject_id` je nullable pa stariji zapisi mogu da nose
 * samo `subject_name`.
 */
export async function listEmployeesWithoutComplianceRecords(
  supabase: SupabaseClient,
  input: EmployeesWithoutRecordsInput,
): Promise<QueryResult<EmployeesWithoutRecordsResult>> {
  const limit = input.limit ?? 50;

  let employeesQuery = supabase
    .from("employees")
    .select(
      "id, first_name, last_name, position, client_company_id, client_companies ( name )",
    )
    .eq("agency_id", input.agencyId)
    .eq("active", true)
    .order("last_name", { ascending: true })
    .limit(2000);

  if (input.clientCompanyId) {
    employeesQuery = employeesQuery.eq(
      "client_company_id",
      input.clientCompanyId,
    );
  } else if (input.clientIds !== null) {
    employeesQuery = employeesQuery.in("client_company_id", input.clientIds);
  }

  const { data: employees, error: empErr } = await employeesQuery;
  if (empErr) return { ok: false, message: empErr.message };

  const employeeRows = employees ?? [];
  if (employeeRows.length === 0) {
    return {
      ok: true,
      value: { employees: [], checked_employees: 0, truncated: false },
    };
  }

  const clientIdsForRecords = [
    ...new Set(employeeRows.map((e) => e.client_company_id as string)),
  ];

  let recordsQuery = supabase
    .from("compliance_records")
    .select("subject_id, subject_name")
    .eq("agency_id", input.agencyId)
    .eq("subject_type", "worker")
    .in("client_company_id", clientIdsForRecords)
    .limit(5000);

  if (input.recordType) {
    recordsQuery = recordsQuery.eq("record_type", input.recordType);
  }

  const { data: records, error: recErr } = await recordsQuery;
  if (recErr) return { ok: false, message: recErr.message };

  const coveredIds = new Set<string>();
  const coveredNames = new Set<string>();
  for (const record of records ?? []) {
    const subjectId = record.subject_id as string | null;
    if (subjectId) coveredIds.add(subjectId);
    const subjectName = (record.subject_name as string | null)?.trim();
    if (subjectName) coveredNames.add(subjectName.toLowerCase());
  }

  const missing: EmployeeWithoutRecords[] = [];
  for (const employee of employeeRows) {
    const id = employee.id as string;
    const fullName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`
      .replace(/\s+/g, " ")
      .trim();

    if (coveredIds.has(id)) continue;
    if (fullName && coveredNames.has(fullName.toLowerCase())) continue;

    const cc = employee.client_companies as
      | { name?: string }
      | { name?: string }[]
      | null;
    const clientName = Array.isArray(cc)
      ? (cc[0]?.name ?? null)
      : (cc?.name ?? null);

    missing.push({
      employee_id: id,
      full_name: fullName || id.slice(0, 8),
      position: (employee.position as string | null) ?? null,
      client_company_id: employee.client_company_id as string,
      client_name: clientName,
    });
  }

  return {
    ok: true,
    value: {
      employees: missing.slice(0, limit),
      checked_employees: employeeRows.length,
      truncated: missing.length > limit,
    },
  };
}
