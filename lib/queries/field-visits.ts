/**
 * Deljene read funkcije nad terenskim posetama za brojanje po radniku agencije
 * i periodu. Namerno odvojeno od `listFieldVisitsForAgency`, koja uz svaki red
 * učitava i fotografije, imena i roditeljske naloge — preskupo za brojanje.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayBelgradeIso } from "@/lib/compliance/types";
import type { QueryResult } from "@/lib/queries/clients";

export type PeriodType = "month" | "quarter" | "range";

export type PeriodInput = {
  period_type: PeriodType;
  year?: number | null;
  month?: number | null;
  quarter?: number | null;
  date_from?: string | null;
  date_to?: string | null;
};

export type ResolvedPeriod = {
  /** YYYY-MM-DD, uključivo */
  from: string;
  /** YYYY-MM-DD, uključivo */
  to: string;
  label: string;
};

export type PeriodLocale = "sr" | "en";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES_SR = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthPeriodLabel(
  year: number,
  month: number,
  locale: PeriodLocale,
): string {
  if (locale === "en") {
    return `${MONTH_NAMES_EN[month - 1]} ${year}`;
  }
  return `${MONTH_NAMES_SR[month - 1]} ${year}.`;
}

/**
 * Pretvara ravne argumente (koje model lakše popunjava od ugnježđene unije) u
 * konkretan opseg datuma.
 */
export function resolvePeriod(
  input: PeriodInput,
  todayIso: string = todayBelgradeIso(),
  locale: PeriodLocale = "sr",
): QueryResult<ResolvedPeriod> {
  const currentYear = Number(todayIso.slice(0, 4));

  if (input.period_type === "range") {
    const from = input.date_from?.trim();
    const to = input.date_to?.trim();
    if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
      return {
        ok: false,
        message:
          "Za period_type='range' su obavezni date_from i date_to u formatu YYYY-MM-DD.",
      };
    }
    if (from > to) {
      return { ok: false, message: "date_from ne sme biti posle date_to." };
    }
    return { ok: true, value: { from, to, label: `${from} — ${to}` } };
  }

  const year = input.year ?? currentYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, message: "Nevažeća godina." };
  }

  if (input.period_type === "month") {
    const month = input.month;
    if (!Number.isInteger(month) || month! < 1 || month! > 12) {
      return {
        ok: false,
        message: "Za period_type='month' je obavezan month (1-12).",
      };
    }
    const mm = String(month).padStart(2, "0");
    const last = lastDayOfMonth(year, month!);
    return {
      ok: true,
      value: {
        from: `${year}-${mm}-01`,
        to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
        label: monthPeriodLabel(year, month!, locale),
      },
    };
  }

  const quarter = input.quarter;
  if (!Number.isInteger(quarter) || quarter! < 1 || quarter! > 4) {
    return {
      ok: false,
      message: "Za period_type='quarter' je obavezan quarter (1-4).",
    };
  }
  const startMonth = (quarter! - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const last = lastDayOfMonth(year, endMonth);
  return {
    ok: true,
    value: {
      from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      to: `${year}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
      label:
        locale === "en" ? `Q${quarter} ${year}` : `Q${quarter} ${year}.`,
    },
  };
}

export type VisitCountRow = {
  user_id: string | null;
  full_name: string;
  visit_count: number;
};

export type VisitCountInput = {
  agencyId: string;
  period: ResolvedPeriod;
  /** null = razbij po svim radnicima agencije. */
  assignedUserId?: string | null;
  clientCompanyId?: string | null;
};

export type VisitCountResult = {
  total: number;
  by_user: VisitCountRow[];
  truncated: boolean;
};

const MAX_VISITS_SCANNED = 5000;

/**
 * Broj poseta u periodu, ukupno i po radniku agencije (`assigned_user_id`).
 * Napomena: „radnik” je ovde član agencije, ne `employees` red klijenta —
 * terenske posete se dodeljuju profilima, ne radnicima klijenta.
 */
export async function countFieldVisitsByUser(
  supabase: SupabaseClient,
  input: VisitCountInput,
): Promise<QueryResult<VisitCountResult>> {
  let query = supabase
    .from("field_visits")
    .select("id, assigned_user_id")
    .eq("agency_id", input.agencyId)
    .gte("scheduled_at", `${input.period.from}T00:00:00.000Z`)
    .lte("scheduled_at", `${input.period.to}T23:59:59.999Z`)
    .limit(MAX_VISITS_SCANNED + 1);

  if (input.assignedUserId) {
    query = query.eq("assigned_user_id", input.assignedUserId);
  }
  if (input.clientCompanyId) {
    query = query.eq("client_company_id", input.clientCompanyId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, message: error.message };

  const rows = data ?? [];
  const truncated = rows.length > MAX_VISITS_SCANNED;
  const scanned = rows.slice(0, MAX_VISITS_SCANNED);

  const counts = new Map<string | null, number>();
  for (const row of scanned) {
    const key = (row.assigned_user_id as string | null) ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const userIds = [...counts.keys()].filter((id): id is string => !!id);
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      names.set(
        p.user_id as string,
        (p.full_name as string | null)?.trim() ||
          (p.email as string | null) ||
          (p.user_id as string).slice(0, 8),
      );
    }
  }

  const byUser: VisitCountRow[] = [...counts.entries()]
    .map(([userId, count]) => ({
      user_id: userId,
      full_name: userId
        ? (names.get(userId) ?? userId.slice(0, 8))
        : "Bez dodeljenog radnika",
      visit_count: count,
    }))
    .sort((a, b) => b.visit_count - a.visit_count);

  return {
    ok: true,
    value: {
      total: scanned.length,
      by_user: byUser,
      truncated,
    },
  };
}
