/**
 * Datumi za AI asistenta — prikaz i parsiranje u Europe/Belgrade.
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function belgradeParts(utcMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Zidni sat u Beogradu → UTC ISO. */
export function belgradeLocalToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const shown = belgradeParts(desiredAsUtc);
  const shownAsUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    0,
  );
  return new Date(desiredAsUtc - (shownAsUtc - desiredAsUtc)).toISOString();
}

export function formatBelgradeDate(isoDate: string): string {
  const raw = isoDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoDate;
  const [y, m, d] = raw.split("-");
  return `${d}.${m}.${y}.`;
}

export function formatBelgradeDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const p = belgradeParts(parsed.getTime());
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}. ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export type ParsedDate =
  | { ok: true; isoDate: string }
  | { ok: false; error: string };

export type ParsedDateTime =
  | { ok: true; iso: string }
  | { ok: false; error: string };

/** Datum-only → YYYY-MM-DD. */
export function parseAgentDate(raw: string): ParsedDate {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Datum je prazan." };

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { ok: true, isoDate: `${iso[1]}-${iso[2]}-${iso[3]}` };
  }

  const sr = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  if (sr) {
    return {
      ok: true,
      isoDate: `${sr[3]}-${pad2(Number(sr[2]))}-${pad2(Number(sr[1]))}`,
    };
  }

  return {
    ok: false,
    error: "Datum mora biti u formatu DD.MM.GGGG ili YYYY-MM-DD.",
  };
}

/**
 * Datum+vreme → UTC ISO. Prihvata ISO, YYYY-MM-DD[ HH:mm] i DD.MM.YYYY[ HH:mm].
 * Bez vremena podrazumeva 09:00 u Beogradu.
 */
export function parseAgentDateTime(raw: string): ParsedDateTime {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Datum i vreme su prazni." };

  if (
    trimmed.includes("T") ||
    /[zZ]$/.test(trimmed) ||
    /[+-]\d{2}:\d{2}$/.test(trimmed)
  ) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Neispravan ISO datum/vreme." };
    }
    return { ok: true, iso: parsed.toISOString() };
  }

  let year: number;
  let month: number;
  let day: number;
  let hour = 9;
  let minute = 0;

  const sr = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  const iso = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );

  if (sr) {
    day = Number(sr[1]);
    month = Number(sr[2]);
    year = Number(sr[3]);
    if (sr[4] !== undefined) hour = Number(sr[4]);
    if (sr[5] !== undefined) minute = Number(sr[5]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
    if (iso[4] !== undefined) hour = Number(iso[4]);
    if (iso[5] !== undefined) minute = Number(iso[5]);
  } else {
    return {
      ok: false,
      error:
        "Datum/vreme mora biti ISO, DD.MM.GGGG HH:mm ili YYYY-MM-DD HH:mm.",
    };
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return { ok: false, error: "Neispravan datum ili vreme." };
  }

  return {
    ok: true,
    iso: belgradeLocalToUtcIso(year, month, day, hour, minute),
  };
}
