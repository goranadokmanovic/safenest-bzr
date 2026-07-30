/**
 * Pomoćne funkcije za alate: razrešavanje imena u ID-jeve.
 *
 * Model nikad ne barata UUID-jevima — korisnik izgovori „Delta Holding” ili
 * „Marko”, a razrešavanje ide ovde, unutar opsega ulogovanog korisnika. Time
 * nestaje i cela klasa grešaka sa izmišljenim ID-jevima.
 */

import { lookupClientByName, type ScopedClient } from "@/lib/queries/clients";
import { listAgencyWorkers, type AgencyWorkerOption } from "@/lib/field-visits/list";
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

/** Ujednačen oblik greške iz upitnog sloja. */
export function queryFailure(message: string): ToolOutcome {
  return { ok: false, error: message };
}
