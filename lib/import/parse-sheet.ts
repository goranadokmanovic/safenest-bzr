/**
 * Parsiranje Excel/CSV fajla u browseru (bez uploada na server).
 *
 * SheetJS se učitava kroz `import()` — chunk se dovlači samo kada korisnik
 * otvori dijalog za uvoz. Paket je vendored (`vendor/xlsx-0.20.3.tgz`), pa
 * nema zavisnosti od CDN-a; `warmSpreadsheetParser()` unaprijed dovuče chunk
 * kako bi uvoz radio i offline.
 */

import type { ParsedSheet, ParsedWorkbook, SheetCell } from "@/lib/import/types";

type XlsxModule = typeof import("xlsx");

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMPORT_EXTENSIONS = [
  ".xlsx",
  ".xls",
  ".xlsm",
  ".csv",
  ".txt",
] as const;

export const IMPORT_FILE_ACCEPT = ACCEPTED_IMPORT_EXTENSIONS.join(",");

export type ParseErrorCode =
  | "TOO_LARGE"
  | "UNSUPPORTED"
  | "EMPTY"
  | "PARSE_FAILED";

export class SpreadsheetParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SpreadsheetParseError";
    this.code = code;
  }
}

let xlsxPromise: Promise<XlsxModule> | null = null;

function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxPromise) {
    xlsxPromise = import("xlsx").then((mod) => {
      const withDefault = mod as unknown as { default?: XlsxModule };
      return withDefault.default && typeof withDefault.default.read === "function"
        ? withDefault.default
        : (mod as XlsxModule);
    });
    xlsxPromise.catch(() => {
      xlsxPromise = null;
    });
  }
  return xlsxPromise;
}

/** Dovuče parser chunk unaprijed (za offline upotrebu). Greške se ignorišu. */
export function warmSpreadsheetParser(): void {
  void loadXlsx().catch(() => undefined);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function isTextFile(ext: string): boolean {
  return ext === ".csv" || ext === ".txt";
}

/** UTF-8 (sa ili bez BOM-a), sa fallback-om na windows-1250 za stare CSV izvoze. */
function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const body =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder("windows-1250").decode(body);
    } catch {
      return new TextDecoder().decode(body);
    }
  }
}

function cellText(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function isEmptyRow(row: SheetCell[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}

function toParsedSheet(
  xlsx: XlsxModule,
  name: string,
  worksheet: unknown,
): ParsedSheet | null {
  /* `blankrows: true` čuva poravnanje sa stvarnim linijama tabele. */
  const matrix = xlsx.utils.sheet_to_json<SheetCell[]>(
    worksheet as Parameters<XlsxModule["utils"]["sheet_to_json"]>[0],
    { header: 1, raw: true, defval: null, blankrows: true },
  );

  const headerRowIndex = matrix.findIndex(
    (row) => Array.isArray(row) && !isEmptyRow(row),
  );
  if (headerRowIndex === -1) return null;

  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(cellText);
  while (headers.length > 0 && headers[headers.length - 1] === "") {
    headers.pop();
  }
  if (headers.length === 0) return null;

  const rows: SheetCell[][] = [];
  const rowNumbers: number[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row) || isEmptyRow(row)) continue;
    rows.push(headers.map((_, col) => (row[col] === undefined ? null : row[col])));
    rowNumbers.push(i + 1);
  }

  return { name, headers, rows, rowNumbers };
}

export async function parseSpreadsheetFile(
  file: File,
): Promise<ParsedWorkbook> {
  const ext = extensionOf(file.name);
  if (!ACCEPTED_IMPORT_EXTENSIONS.includes(ext as never)) {
    throw new SpreadsheetParseError("UNSUPPORTED", ext || file.name);
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new SpreadsheetParseError("TOO_LARGE", String(file.size));
  }

  const xlsx = await loadXlsx();
  const buffer = await file.arrayBuffer();

  let workbook: ReturnType<XlsxModule["read"]>;
  try {
    workbook = isTextFile(ext)
      ? xlsx.read(decodeTextFile(buffer), {
          type: "string",
          cellDates: true,
          raw: true,
        })
      : xlsx.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  } catch (err) {
    throw new SpreadsheetParseError(
      "PARSE_FAILED",
      err instanceof Error ? err.message : undefined,
    );
  }

  const sheets: ParsedSheet[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const parsed = toParsedSheet(xlsx, sheetName, worksheet);
    if (parsed && parsed.rows.length > 0) sheets.push(parsed);
  }

  if (sheets.length === 0) {
    throw new SpreadsheetParseError("EMPTY");
  }

  return { fileName: file.name, sheets };
}
