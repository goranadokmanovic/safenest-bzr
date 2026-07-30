/** Marker za prazno / nepopunjeno polje (sr + en varijante). */
const EMPTY_MARKERS = [
  "nije navedeno",
  "not provided",
  "not specified",
  "not mentioned",
  "n/a",
  "-",
];

export type ReportFields = Record<string, string>;

export function isReportFieldEmpty(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  return EMPTY_MARKERS.includes(v.toLowerCase());
}

/**
 * Izvlači nazive polja iz template_content.
 * Očekivani format: linije tipa "Naziv polja:" ili "Naziv polja: hint".
 */
export function parseTemplateFieldNames(templateContent: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of templateContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([^:]{1,120}):\s*(.*)$/);
    if (!match) continue;

    const name = match[1].replace(/^[-*•\d.)\s]+/, "").trim();
    if (!name || name.length > 80) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export function emptyReportFields(
  fieldNames: string[],
  emptyLabel = "",
): ReportFields {
  const out: ReportFields = {};
  for (const name of fieldNames) {
    out[name] = emptyLabel;
  }
  return out;
}

export function reportFieldsToText(fields: ReportFields): string {
  return Object.entries(fields)
    .map(([name, value]) => {
      const v = (value ?? "").trim();
      return v ? `${name}: ${v}` : `${name}:`;
    })
    .join("\n");
}

/** Prioritet prikaza: Broj naloga → Naziv klijenta → Delatnost → … → Napomena poslednja. */
const REPORT_FIELD_HEAD_PATTERNS: RegExp[] = [
  /^broj\s*naloga$/i,
  /^order\s*number$/i,
  /^naziv\s*klijenta$/i,
  /^client(\s*name)?$/i,
  /^klijent$/i,
  /^delatnost$/i,
  /^industr(y|ies)$/i,
];

const REPORT_FIELD_TAIL_PATTERNS: RegExp[] = [
  /^napomene?$/i,
  /^notes?$/i,
  /^remark(s)?$/i,
];

function reportFieldPatternRank(name: string, patterns: RegExp[]): number {
  const trimmed = name.trim();
  const idx = patterns.findIndex((p) => p.test(trimmed));
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

/**
 * Sortira polja zapisnika samo za UI prikaz (ne menja podatke).
 * Stabilan za polja van head/tail grupe.
 */
export function sortReportFieldEntries(
  entries: Array<[string, string]>,
): Array<[string, string]> {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aHead = reportFieldPatternRank(a.entry[0], REPORT_FIELD_HEAD_PATTERNS);
      const bHead = reportFieldPatternRank(b.entry[0], REPORT_FIELD_HEAD_PATTERNS);
      const aIsHead = Number.isFinite(aHead);
      const bIsHead = Number.isFinite(bHead);
      if (aIsHead || bIsHead) {
        if (aIsHead && bIsHead) return aHead - bHead;
        return aIsHead ? -1 : 1;
      }

      const aTail = reportFieldPatternRank(a.entry[0], REPORT_FIELD_TAIL_PATTERNS);
      const bTail = reportFieldPatternRank(b.entry[0], REPORT_FIELD_TAIL_PATTERNS);
      const aIsTail = Number.isFinite(aTail);
      const bIsTail = Number.isFinite(bTail);
      if (aIsTail || bIsTail) {
        if (aIsTail && bIsTail) return aTail - bTail;
        return aIsTail ? 1 : -1;
      }

      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/**
 * Parsira legacy tekst zapisnika ("Polje: vrednost") u objekat.
 * Ako su dati fieldNames, zadržava redosled i uključuje prazna polja.
 */
export function parseReportTextToFields(
  text: string | null | undefined,
  fieldNames?: string[],
): ReportFields {
  const parsed: ReportFields = {};
  const source = (text ?? "").trim();
  if (source) {
    let currentKey: string | null = null;
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const match = line.match(/^([^:]{1,120}):\s*(.*)$/);
      if (match) {
        const name = match[1].replace(/^[-*•\d.)\s]+/, "").trim();
        if (name) {
          currentKey = name;
          parsed[name] = (match[2] ?? "").trim();
          continue;
        }
      }
      if (currentKey && line.trim()) {
        parsed[currentKey] = `${parsed[currentKey]}\n${line.trim()}`.trim();
      }
    }
  }

  if (!fieldNames?.length) return parsed;

  const out = emptyReportFields(fieldNames);
  for (const name of fieldNames) {
    const direct = parsed[name];
    if (direct !== undefined) {
      out[name] = direct;
      continue;
    }
    const lower = name.toLowerCase();
    const found = Object.entries(parsed).find(
      ([k]) => k.toLowerCase() === lower,
    );
    if (found) out[name] = found[1];
  }
  return out;
}

export function normalizeReportFields(
  value: unknown,
  fieldNames?: string[],
): ReportFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const out: ReportFields = {};

  if (fieldNames?.length) {
    for (const name of fieldNames) {
      const v = raw[name];
      out[name] = typeof v === "string" ? v : "";
    }
    // Sačuvaj i eventualna dodatna polja koja nisu u šablonu
    for (const [k, v] of Object.entries(raw)) {
      if (!(k in out) && typeof v === "string") out[k] = v;
    }
    return out;
  }

  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Spaja AI delta u postojeća polja: menja samo ključeve koje AI eksplicitno
 * popuni ne-praznom vrednošću. Ostalo ostaje netaknuto.
 */
export function mergeFilledReportFields(
  current: ReportFields,
  updates: ReportFields,
  fieldNames: string[],
): ReportFields {
  const next: ReportFields = { ...current };
  for (const name of fieldNames) {
    if (!(name in next)) next[name] = "";
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (isReportFieldEmpty(trimmed)) continue;

    const target =
      fieldNames.find((n) => n.toLowerCase() === key.toLowerCase()) ?? key;
    next[target] = trimmed;
  }
  return next;
}

export function emptyLabelForLocale(language: string): string {
  return language === "en" ? "Not provided" : "Nije navedeno";
}
