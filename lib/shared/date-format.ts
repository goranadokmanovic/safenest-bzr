/** Display / parse dates in SR format (DD.MM.YYYY) ↔ ISO (YYYY-MM-DD). */

/** ISO `YYYY-MM-DD` (or datetime prefix) → `DD.MM.YYYY` */
export function isoToDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso.trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Accepts `DD.MM.YYYY`, `DD/MM/YYYY`, or `YYYY-MM-DD`.
 * Empty → null. Unparseable → "invalid".
 */
export function displayDateToIso(raw: string): string | null | "invalid" {
  /* „25.08.1982." — tačka na kraju je uobičajen srpski zapis. */
  const v = raw.trim().replace(/[.\s]+$/, "");
  if (!v) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (iso) {
    return validIso(iso[1]!, iso[2]!.padStart(2, "0"), iso[3]!.padStart(2, "0"));
  }

  const dmy = /^(\d{1,2})[./\-\s]+(\d{1,2})[./\-\s]+(\d{2,4})$/.exec(v);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, "0");
    const mm = dmy[2]!.padStart(2, "0");
    const yyyy = expandYear(dmy[3]!);
    return validIso(yyyy, mm, dd);
  }

  return "invalid";
}

/**
 * Spreadsheet cell → ISO date. Pokriva `Date` (SheetJS cellDates),
 * Excel serijski broj i tekstualne zapise.
 */
export function cellToIsoDate(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : toIso(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToIso(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  /* Broj upisan kao tekst ("45123") je i dalje Excel serijski datum. */
  if (/^\d{1,6}(\.\d+)?$/.test(text) && !/^\d{8}$/.test(text)) {
    return excelSerialToIso(Number(text));
  }

  return displayDateToIso(text);
}

/** Excel serijski broj (1900 sistem) → ISO datum. */
function excelSerialToIso(serial: number): string | "invalid" {
  if (serial < 1 || serial > 100_000) return "invalid";
  /* 1899-12-30 kompenzuje Excel-ov 1900 leap-year bug. */
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? "invalid" : toIso(dt);
}

function toIso(dt: Date): string {
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function expandYear(raw: string): string {
  if (raw.length === 4) return raw;
  const n = Number(raw);
  return String(n <= 40 ? 2000 + n : 1900 + n);
}

function validIso(y: string, m: string, d: string): string | "invalid" {
  const iso = `${y}-${m}-${d}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== Number(y) ||
    dt.getMonth() + 1 !== Number(m) ||
    dt.getDate() !== Number(d)
  ) {
    return "invalid";
  }
  return iso;
}
