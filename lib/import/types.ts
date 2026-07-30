/**
 * Generički tipovi za uvoz tabela (Excel/CSV).
 * Namena: isti sloj koristi i uvoz radnika i budući uvoz drugih entiteta —
 * dovoljno je definisati listu polja (`ImportField`) za dati entitet.
 */

export type SheetCell = string | number | boolean | Date | null;

export type ParsedSheet = {
  name: string;
  /** Prvi neprazan red fajla, već sveden na tekst. */
  headers: string[];
  rows: SheetCell[][];
  /** Stvarni broj linije u tabeli za svaki red iz `rows` (1-bazno). */
  rowNumbers: number[];
};

export type ParsedWorkbook = {
  fileName: string;
  sheets: ParsedSheet[];
};

export type ImportFieldType = "text" | "date" | "boolean";

export type ImportField<K extends string = string> = {
  key: K;
  label: string;
  required?: boolean;
  type?: ImportFieldType;
  /** Nazivi kolona (SR/EN, bez dijakritike) za automatsko prepoznavanje. */
  aliases?: string[];
  maxLength?: number;
  /**
   * Blaga provera vrednosti: vraća poruku upozorenja ili null.
   * Upozorenja ne blokiraju uvoz — red se i dalje uvozi.
   */
  warn?: (value: string) => string | null;
};

/** Polje → indeks kolone u tabeli (null = nije mapirano). */
export type ColumnMapping<K extends string = string> = Record<
  K,
  number | null
>;

export type MappedRow<K extends string = string> = {
  /** Broj linije u tabeli — za prikaz „Red N“ korisniku. */
  rowNumber: number;
  values: Record<K, string | null>;
  /** Prevedene poruke o problemima; prazno = red je spreman za uvoz. */
  errors: string[];
  /** Sumnjive vrednosti koje ne sprečavaju uvoz. */
  warnings: string[];
};

export type MapRowsResult<K extends string = string> = {
  rows: MappedRow<K>[];
  validCount: number;
  invalidCount: number;
  /** Broj redova izbačenih kao duplikati unutar fajla. */
  duplicateCount: number;
  /** Broj redova koji se uvoze, ali imaju upozorenje. */
  warningCount: number;
};

/** Poruke koje sloj za mapiranje ubacuje u `MappedRow.errors`. */
export type ImportMessages = {
  /** `{field}` → labela polja. */
  required: string;
  invalidDate: string;
  tooLong: string;
  duplicate: string;
};
