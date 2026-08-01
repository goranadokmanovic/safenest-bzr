/**
 * Poređenje ličnih imena za pretragu (compliance subject, radnici).
 * Toleriše redosled „Ime Prezime” / „Prezime Ime” i srpsku dijakritiku.
 */

/** Skida dijakritiku, normalizuje razmake, lowercase. */
export function foldPersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function personNameTokens(value: string): string[] {
  return foldPersonName(value)
    .split(" ")
    .filter((t) => t.length > 0)
    .sort();
}

/** Isti skup tokena — „Ana Jovanović” ≡ „Jovanovic Ana”. */
export function personNamesEquivalent(a: string, b: string): boolean {
  const ta = personNameTokens(a);
  const tb = personNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.length !== tb.length) return false;
  return ta.every((t, i) => t === tb[i]);
}

/**
 * Da li needle pogada subject:
 * - ekvivalentni tokeni, ili
 * - svi tokeni needle-a postoje u subject-u (npr. samo prezime).
 */
export function personNameMatches(needle: string, subject: string): boolean {
  if (personNamesEquivalent(needle, subject)) return true;

  const nt = personNameTokens(needle);
  if (nt.length === 0) return false;

  const st = new Set(personNameTokens(subject));
  if (st.size === 0) return false;

  return nt.every((t) => st.has(t));
}
