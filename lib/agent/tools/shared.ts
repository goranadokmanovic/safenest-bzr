/**
 * Pomoćne funkcije za alate: razrešavanje imena u ID-jeve.
 *
 * Model nikad ne barata UUID-jevima — korisnik izgovori „Delta Holding” ili
 * „Marko”, a razrešavanje ide ovde, unutar opsega ulogovanog korisnika. Time
 * nestaje i cela klasa grešaka sa izmišljenim ID-jevima.
 */

import {
  clientExistsInAgency,
  lookupClientByName,
  type ScopedClient,
} from "@/lib/queries/clients";
import {
  lookupComplianceRecords,
  type ComplianceRecordMatch,
} from "@/lib/queries/compliance";
import {
  listAgencyCollaborators,
  listAgencyWorkers,
  type AgencyWorkerOption,
} from "@/lib/field-visits/list";
import { clientOutOfScopeReply } from "@/lib/agent/fixed-replies";
import type { ComplianceRecordType } from "@/lib/compliance/types";
import type { ToolContext, ToolOutcome } from "@/lib/agent/types";

export type ClientArg =
  | { kind: "all" }
  | { kind: "one"; client: ScopedClient }
  | { kind: "halt"; outcome: ToolOutcome };

/**
 * `null` / prazno ime znači „svi klijenti u opsegu”. Ako naziv ne daje tačno
 * jedan pogodak, alat se zaustavlja i vraća modelu strukturu iz koje on traži
 * pojašnjenje umesto da pogađa.
 */
export async function resolveClientArg(
  ctx: ToolContext,
  clientName: string | null | undefined,
): Promise<ClientArg> {
  const name = clientName?.trim();
  if (!name) return { kind: "all" };

  const lookup = await lookupClientByName(
    ctx.supabase,
    ctx.agencyId,
    ctx.clientIds,
    name,
  );

  if (!lookup.ok) {
    return { kind: "halt", outcome: { ok: false, error: lookup.message } };
  }

  if (lookup.value.kind === "none") {
    // Saradnik kroz RLS ne vidi klijente koji mu nisu dodeljeni, pa "nema
    // pogotka" ne znači i "ne postoji". Bez ove provere poruka bi tvrdila da
    // klijent ne postoji, iako postoji u agenciji.
    if (ctx.clientIds !== null && (await clientExistsInAgency(ctx.supabase, name))) {
      return {
        kind: "halt",
        outcome: {
          ok: true,
          data: {
            status: "client_out_of_scope",
            searched_for: name,
          },
          // Fiksni tekst: odbijanje pristupa ne prepuštamo modelu da ga
          // preformuliše, jer sme da oda samo to da klijent nije dodeljen.
          finalReply: clientOutOfScopeReply(name),
        },
      };
    }

    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "client_not_found",
          searched_for: name,
          hint: "Nijedan klijent u opsegu korisnika ne odgovara tom nazivu. Pitaj korisnika za tačan naziv.",
        },
      },
    };
  }

  if (lookup.value.kind === "many") {
    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "needs_clarification",
          searched_for: name,
          candidates: lookup.value.candidates.map((c) => c.name),
          hint: "Više klijenata odgovara nazivu. Pitaj korisnika koji od ponuđenih misli.",
        },
      },
    };
  }

  return { kind: "one", client: lookup.value.client };
}

export type WorkerArg =
  | { kind: "all" }
  | { kind: "one"; worker: AgencyWorkerOption }
  | { kind: "halt"; outcome: ToolOutcome };

/**
 * Razrešava ime člana agencije (profiles), ne radnika klijenta (employees) —
 * terenske posete se dodeljuju profilima.
 *
 * Koristi `listAgencyWorkers`, isti izvor iz kog se pune postojeći dropdown-i
 * u UI-ju, pa asistent ne vidi nijedno ime koje korisnik ionako ne vidi.
 */
export async function resolveWorkerArg(
  ctx: ToolContext,
  workerName: string | null | undefined,
): Promise<WorkerArg> {
  const name = workerName?.trim();
  if (!name) return { kind: "all" };

  const workers = await listAgencyWorkers(ctx.supabase, ctx.agencyId);
  const needle = name.toLowerCase();

  const matches = workers.filter((w) =>
    w.full_name.toLowerCase().includes(needle),
  );

  if (matches.length === 0) {
    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "worker_not_found",
          searched_for: name,
          available_workers: workers.map((w) => w.full_name),
          hint: "Nijedan član agencije ne odgovara tom imenu. Ponudi korisniku listu dostupnih imena.",
        },
      },
    };
  }

  if (matches.length > 1) {
    const exact = matches.filter((w) => w.full_name.toLowerCase() === needle);
    if (exact.length !== 1) {
      return {
        kind: "halt",
        outcome: {
          ok: true,
          data: {
            status: "needs_clarification",
            searched_for: name,
            candidates: matches.map((w) => w.full_name),
            hint: "Više članova agencije odgovara imenu. Pitaj korisnika na koga misli.",
          },
        },
      };
    }
    return { kind: "one", worker: exact[0]! };
  }

  return { kind: "one", worker: matches[0]! };
}

/**
 * Samo agency_collaborator — za dodelu klijentu. Ne mešati sa
 * resolveWorkerArg (taj uključuje owner/field_worker za terenske posete).
 */
export async function resolveCollaboratorArg(
  ctx: ToolContext,
  collaboratorName: string | null | undefined,
): Promise<WorkerArg> {
  const name = collaboratorName?.trim();
  if (!name) return { kind: "all" };

  const collaborators = await listAgencyCollaborators(
    ctx.supabase,
    ctx.agencyId,
  );
  const needle = name.toLowerCase();
  const matches = collaborators.filter((w) =>
    w.full_name.toLowerCase().includes(needle),
  );

  if (matches.length === 0) {
    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "collaborator_not_found",
          searched_for: name,
          available_collaborators: collaborators.map((w) => w.full_name),
          hint: "Nijedan saradnik ne odgovara tom imenu. Ponudi korisniku listu dostupnih saradnika.",
        },
      },
    };
  }

  if (matches.length > 1) {
    const exact = matches.filter((w) => w.full_name.toLowerCase() === needle);
    if (exact.length !== 1) {
      return {
        kind: "halt",
        outcome: {
          ok: true,
          data: {
            status: "needs_clarification",
            searched_for: name,
            candidates: matches.map((w) => w.full_name),
            hint: "Više saradnika odgovara imenu. Pitaj korisnika na koga misli.",
          },
        },
      };
    }
    return { kind: "one", worker: exact[0]! };
  }

  return { kind: "one", worker: matches[0]! };
}

export type ComplianceRecordArg =
  | { kind: "one"; record: ComplianceRecordMatch }
  | { kind: "halt"; outcome: ToolOutcome };

/**
 * Razrešava jedan compliance zapis unutar već razrešenog klijenta.
 * Ambiguous → needs_clarification sa čitljivim kandidatima (bez UUID u hintu).
 */
export async function resolveComplianceRecordArg(
  ctx: ToolContext,
  client: ScopedClient,
  input: {
    subjectName: string;
    category?: string | null;
    recordType?: ComplianceRecordType | null;
  },
): Promise<ComplianceRecordArg> {
  const lookup = await lookupComplianceRecords(ctx.supabase, {
    agencyId: ctx.agencyId,
    clientCompanyId: client.id,
    subjectName: input.subjectName,
    category: input.category,
    recordType: input.recordType,
  });

  if (!lookup.ok) {
    return { kind: "halt", outcome: { ok: false, error: lookup.message } };
  }

  const matches = lookup.value;

  if (matches.length === 0) {
    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "record_not_found",
          client: client.name,
          searched_for: input.subjectName,
          category: input.category ?? null,
          record_type: input.recordType ?? null,
          hint: "Nijedan compliance zapis ne odgovara. Pitaj korisnika za tačnije ime, kategoriju ili tip zapisa.",
        },
      },
    };
  }

  if (matches.length > 1) {
    // Ako je kategorija tačno pogodila jedan, uzmi taj.
    const categoryNeedle = input.category?.trim().toLowerCase();
    if (categoryNeedle) {
      const exactCat = matches.filter(
        (m) => m.category.trim().toLowerCase() === categoryNeedle,
      );
      if (exactCat.length === 1) {
        return { kind: "one", record: exactCat[0]! };
      }
    }

    return {
      kind: "halt",
      outcome: {
        ok: true,
        data: {
          status: "needs_clarification",
          client: client.name,
          searched_for: input.subjectName,
          candidates: matches.slice(0, 8).map((m) => ({
            subject_name: m.subject_name,
            category: m.category,
            record_type: m.record_type,
            expiry_date: m.expiry_date,
          })),
          hint: "Više zapisa odgovara. Pitaj korisnika koji tačno (kategorija / tip / trenutni rok).",
        },
      },
    };
  }

  return { kind: "one", record: matches[0]! };
}

export function recordTypeLabel(type: ComplianceRecordType): string {
  switch (type) {
    case "medical_exam":
      return "Lekarski pregled";
    case "training_certification":
      return "Osposobljavanje";
    case "equipment_check":
      return "Pregled opreme";
    default:
      return type;
  }
}

/** Ujednačen oblik greške iz upitnog sloja. */
export function queryFailure(message: string): ToolOutcome {
  return { ok: false, error: message };
}

/** Tekst koji model dobija uz write predlog — ne sme da tvrdi da je urađeno. */
export const PENDING_CONFIRMATION_HINT =
  "Predlog je pripremljen i čeka potvrdu korisnika dugmetom ispod poruke. Reci mu da pregleda parametre i potvrdi ili otkaže. NEMOJ tvrditi da je akcija već izvršena ili sačuvana.";
