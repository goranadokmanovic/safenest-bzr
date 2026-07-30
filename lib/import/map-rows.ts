/**
 * Mapiranje kolona tabele na polja entiteta + validacija redova.
 * Sloj je namerno bez React-a i bez znanja o konkretnom entitetu.
 */

import { cellToIsoDate } from "@/lib/shared/date-format";
import type {
  ColumnMapping,
  ImportField,
  ImportMessages,
  MapRowsResult,
  MappedRow,
  ParsedSheet,
  SheetCell,
} from "@/lib/import/types";

const TRUE_WORDS = new Set(["da", "yes", "true", "1", "x", "aktivan", "active"]);
const FALSE_WORDS = new Set([
  "ne",
  "no",
  "false",
  "0",
  "neaktivan",
  "inactive",
]);

/** „Ime i prezime “ → „imeiprezime“; skida dijakritiku i interpunkciju. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function cellToText(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Pogodi mapiranje kolona iz zaglavlja: prvo tačan alias, potom delimično
 * poklapanje. Jedna kolona se ne dodeljuje dvaput.
 */
export function autoDetectMapping<K extends string>(
  headers: string[],
  fields: ImportField<K>[],
): ColumnMapping<K> {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const mapping = {} as ColumnMapping<K>;

  const aliasesOf = (field: ImportField<K>) =>
    [field.key, field.label, ...(field.aliases ?? [])].map(normalizeHeader);

  for (const field of fields) {
    const aliases = aliasesOf(field);
    let found = normalized.findIndex(
      (header, i) => !taken.has(i) && header !== "" && aliases.includes(header),
    );
    if (found === -1) {
      found = normalized.findIndex(
        (header, i) =>
          !taken.has(i) &&
          header !== "" &&
          aliases.some(
            (alias) =>
              alias.length >= 3 &&
              (header.startsWith(alias) || header.includes(alias)),
          ),
      );
    }
    mapping[field.key] = found === -1 ? null : found;
    if (found !== -1) taken.add(found);
  }

  return mapping;
}

export type MapRowsOptions<K extends string> = {
  /** Polja koja zajedno čine identitet reda (za detekciju duplikata u fajlu). */
  dedupeKeys?: K[];
};

export function mapRows<K extends string>(
  sheet: ParsedSheet,
  fields: ImportField<K>[],
  mapping: ColumnMapping<K>,
  messages: ImportMessages,
  options: MapRowsOptions<K> = {},
): MapRowsResult<K> {
  const seen = new Set<string>();
  const rows: MappedRow<K>[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let warningCount = 0;

  sheet.rows.forEach((rawRow, index) => {
    const rowNumber = sheet.rowNumbers[index] ?? index + 2;
    const values = {} as Record<K, string | null>;
    const errors: string[] = [];
    const warnings: string[] = [];

    const collectWarning = (field: ImportField<K>, value: string) => {
      const warning = field.warn?.(value);
      if (warning) warnings.push(warning);
    };

    for (const field of fields) {
      const col = mapping[field.key];
      const raw = col === null || col === undefined ? "" : cellToText(rawRow[col] ?? null);

      if (!raw) {
        if (field.required) {
          errors.push(messages.required.replace("{field}", field.label));
        }
        values[field.key] = null;
        continue;
      }

      if (field.type === "date") {
        const iso = cellToIsoDate(
          col === null || col === undefined ? null : (rawRow[col] ?? null),
        );
        if (iso === "invalid") {
          errors.push(messages.invalidDate.replace("{field}", field.label));
          values[field.key] = null;
        } else {
          values[field.key] = iso;
        }
        continue;
      }

      if (field.type === "boolean") {
        const word = raw.toLowerCase();
        if (FALSE_WORDS.has(word)) values[field.key] = "false";
        else if (TRUE_WORDS.has(word)) values[field.key] = "true";
        else values[field.key] = null;
        continue;
      }

      if (field.maxLength && raw.length > field.maxLength) {
        errors.push(messages.tooLong.replace("{field}", field.label));
        values[field.key] = raw.slice(0, field.maxLength);
        continue;
      }

      values[field.key] = raw;
      collectWarning(field, raw);
    }

    const dedupeKeys = options.dedupeKeys ?? [];
    let isDuplicate = false;
    if (errors.length === 0 && dedupeKeys.length > 0) {
      const identity = dedupeKeys
        .map((key) => (values[key] ?? "").toLowerCase())
        .join("\u0000");
      if (identity.replace(/\u0000/g, "") !== "") {
        if (seen.has(identity)) {
          isDuplicate = true;
          errors.push(messages.duplicate);
        } else {
          seen.add(identity);
        }
      }
    }

    if (errors.length === 0) {
      validCount += 1;
      if (warnings.length > 0) warningCount += 1;
    } else if (isDuplicate) duplicateCount += 1;
    else invalidCount += 1;

    rows.push({ rowNumber, values, errors, warnings });
  });

  return { rows, validCount, invalidCount, duplicateCount, warningCount };
}

/** Redovi bez greške — spremni za slanje na server. */
export function validRows<K extends string>(
  result: MapRowsResult<K>,
): MappedRow<K>[] {
  return result.rows.filter((row) => row.errors.length === 0);
}
