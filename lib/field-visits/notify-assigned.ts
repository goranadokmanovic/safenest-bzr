/**
 * Notifikacija kad se terenska poseta dodeli drugom radniku.
 * Best-effort: greška ne sme da sruši kreiranje posete.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type FieldVisitAssignedNotifyInput = {
  agencyId: string;
  visitId: string;
  assignedUserId: string;
  /** Korisnik koji kreira — ne šaljemo notifikaciju sebi. */
  actorUserId: string;
  clientCompanyId: string;
  clientName: string;
  scheduledAt: string;
};

function formatBelgradeParts(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { date: iso.slice(0, 10), time: "" };
  }
  const date = new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: "Europe/Belgrade",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
  const time = new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
  return { date, time };
}

/**
 * Ubacuje notifikaciju za dodeljenog radnika. Ne baca — loguje greške.
 */
export async function notifyFieldVisitAssigned(
  input: FieldVisitAssignedNotifyInput,
): Promise<void> {
  if (!input.assignedUserId || input.assignedUserId === input.actorUserId) {
    return;
  }

  const { date, time } = formatBelgradeParts(input.scheduledAt);
  const when = time ? `${date} u ${time}` : date;
  const clientLabel = input.clientName.trim() || "klijent";
  const body = `Dodeljena ti je nova poseta: ${clientLabel}, ${when}.`;
  const dedupeKey = `field-visit-assigned-${input.visitId}`;

  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("notifications").insert({
      user_id: input.assignedUserId,
      agency_id: input.agencyId,
      type: "field_visit_assigned",
      title: "Nova dodeljena poseta",
      body,
      severity: "info",
      dedupe_key: dedupeKey,
      metadata: {
        href: "/agencija/field-visits",
        field_visit_id: input.visitId,
        client_company_id: input.clientCompanyId,
      },
    });

    if (error) {
      // 23505 = već postoji (dedupe) — nije greška za tok kreiranja.
      if (error.code !== "23505") {
        console.error(
          "[field-visits] notify assigned failed",
          input.visitId,
          error.message,
        );
      }
    }
  } catch (e) {
    console.error(
      "[field-visits] notify assigned exception",
      input.visitId,
      e instanceof Error ? e.message : e,
    );
  }
}
