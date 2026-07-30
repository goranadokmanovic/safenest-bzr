/**
 * Radnici u formi klijenta: lokalni draft red ↔ payload za API.
 * Koristi se i pri kreiranju klijenta (drafts se šalju posle POST /api/clients)
 * i pri izmeni postojećeg klijenta.
 */

import { displayDateToIso } from "@/lib/shared/date-format";

/** Serverski limit je 500; šaljemo u manjim serijama zbog stabilnosti. */
export const EMPLOYEE_BULK_CHUNK = 200;

export type EmployeeDraft = {
  key: string;
  first_name: string;
  last_name: string;
  position: string;
  /** Prikaz u DD.MM.GGGG formatu; konvertuje se u ISO pri slanju. */
  employment_start: string;
  personal_id_masked: string;
  active: boolean;
};

export type EmployeePayload = {
  first_name: string;
  last_name: string;
  position: string | null;
  personal_id_masked: string | null;
  employment_start: string | null;
  active: boolean;
};

export type ExistingEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  personal_id_masked: string | null;
  employment_start: string | null;
  active: boolean | null;
};

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmployeeDraft(
  init: Partial<Omit<EmployeeDraft, "key">> = {},
): EmployeeDraft {
  return {
    key: newKey(),
    first_name: "",
    last_name: "",
    position: "",
    employment_start: "",
    personal_id_masked: "",
    active: true,
    ...init,
  };
}

export function isDraftEmpty(row: EmployeeDraft): boolean {
  return (
    !row.first_name.trim() &&
    !row.last_name.trim() &&
    !row.position.trim() &&
    !row.employment_start.trim() &&
    !row.personal_id_masked.trim()
  );
}

export type DraftConversion = {
  payloads: EmployeePayload[];
  /** Svi problematični redovi — za crveni okvir na redu. */
  invalidKeys: string[];
  missingNameKeys: string[];
  invalidDateKeys: string[];
};

export function draftsToPayloads(rows: EmployeeDraft[]): DraftConversion {
  const payloads: EmployeePayload[] = [];
  const invalidKeys: string[] = [];
  const missingNameKeys: string[] = [];
  const invalidDateKeys: string[] = [];

  for (const row of rows) {
    if (isDraftEmpty(row)) continue;

    const first = row.first_name.trim();
    const last = row.last_name.trim();
    const iso = displayDateToIso(row.employment_start);

    if (!first || !last) missingNameKeys.push(row.key);
    if (iso === "invalid") invalidDateKeys.push(row.key);

    if (!first || !last || iso === "invalid") {
      invalidKeys.push(row.key);
      continue;
    }

    payloads.push({
      first_name: first,
      last_name: last,
      position: row.position.trim() || null,
      personal_id_masked: row.personal_id_masked.trim() || null,
      employment_start: iso,
      active: row.active,
    });
  }

  return { payloads, invalidKeys, missingNameKeys, invalidDateKeys };
}

/** Šalje radnike u serijama; vraća broj kreiranih ili prvu grešku. */
export async function postEmployees(
  clientId: string,
  payloads: EmployeePayload[],
): Promise<{ created: number; error?: string }> {
  let created = 0;

  for (let i = 0; i < payloads.length; i += EMPLOYEE_BULK_CHUNK) {
    const chunk = payloads.slice(i, i + EMPLOYEE_BULK_CHUNK);
    const res = await fetch(`/api/clients/${clientId}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: chunk }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      created?: number;
      error?: string;
    };
    if (!res.ok) {
      return { created, error: json.error };
    }
    created += json.created ?? chunk.length;
  }

  return { created };
}
