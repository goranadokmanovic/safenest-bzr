import {
  canReadAgencyRecords,
  getAuthContext,
  isClientPortalUser,
} from "@/lib/api/session";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { withApiCatch } from "@/lib/api/with-api-catch";
import {
  listCalendarVisits,
  resolveCalendarRange,
  todayBelgradeDay,
  type CalendarViewMode,
} from "@/lib/field-visits/scheduling-calendar";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseView(raw: string | null): CalendarViewMode {
  if (raw === "day" || raw === "month") return raw;
  return "week";
}

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
  const view = parseView(url.searchParams.get("view"));
  const anchorRaw = url.searchParams.get("date") ?? todayBelgradeDay();
  const anchor = DAY_RE.test(anchorRaw) ? anchorRaw : todayBelgradeDay();

  const { from: fromDay, to: toDay } = resolveCalendarRange(view, anchor);

  const { rows, error } = await listCalendarVisits(supabase, {
    agencyId: profile.agency_id,
    profile,
    userId: user.id,
    fromDay,
    toDay,
  });

  if (error) {
    return jsonError(error, 400, { code: "DATABASE_ERROR" });
  }

  return jsonOk({
    view,
    anchor,
    from: fromDay,
    to: toDay,
    visits: rows,
  });
});
