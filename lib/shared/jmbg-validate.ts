/**
 * Validacija JMBG-a (13 cifara: DDMMGGG RR BBB K).
 *
 *  1-2   dan rođenja
 *  3-4   mesec rođenja
 *  5-7   poslednje tri cifre godine rođenja
 *  8-9   region rođenja
 * 10-12  redni broj (000–499 muški, 500–999 ženski)
 *   13   kontrolna cifra
 *
 * Polje za radnika legitimno može da sadrži i broj lične karte, pa se ovaj
 * modul koristi samo za *indikaciju*, ne za blokiranje unosa.
 */

export const JMBG_LENGTH = 13;

export type JmbgProblem = "length" | "date" | "checksum";

/**
 * Šta kada formula za kontrolnu cifru da 10 ili 11:
 *  - "zero"    → kontrolna cifra je 0 (uobičajeno pravilo, ovakvi JMBG-ovi postoje)
 *  - "invalid" → takav JMBG se odbacuje
 * Pogađa ~18% prefiksa (2 od 11 ostataka po modulu 11).
 */
export type ControlRule = "zero" | "invalid";

export const DEFAULT_CONTROL_RULE: ControlRule = "zero";

/** Skida razmake — JMBG se često kopira sa razmacima iz tabela. */
function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Da li unos ima oblik JMBG-a (tačno 13 cifara) — bez provere datuma i kontrole. */
export function isJmbgShaped(value: string): boolean {
  return /^\d{13}$/.test(compact(value));
}

/**
 * Da li unos izgleda kao *pokušaj* JMBG-a: samo cifre, dužina 11–14.
 * Hvatamo greške tipa „fali cifra / viška cifra“ oko pravih 13.
 * Broj lične karte (9 cifara) i kraći unosi ne ulaze ovde.
 */
export function looksLikeJmbgAttempt(value: string): boolean {
  return /^\d{11,14}$/.test(compact(value));
}

/**
 * Kontrolna cifra za prvih 12 cifara.
 * K = 11 − ((7(b1+b7) + 6(b2+b8) + 5(b3+b9) + 4(b4+b10) + 3(b5+b11) + 2(b6+b12)) mod 11)
 */
export function jmbgControlDigit(
  first12: string,
  rule: ControlRule = DEFAULT_CONTROL_RULE,
): number | null {
  if (!/^\d{12}$/.test(first12)) return null;

  const b = [...first12].map(Number);
  const sum =
    7 * (b[0]! + b[6]!) +
    6 * (b[1]! + b[7]!) +
    5 * (b[2]! + b[8]!) +
    4 * (b[3]! + b[9]!) +
    3 * (b[4]! + b[10]!) +
    2 * (b[5]! + b[11]!);

  const k = 11 - (sum % 11);
  if (k <= 9) return k;
  return rule === "zero" ? 0 : null;
}

/** Prvi problem koji sprečava da unos bude validan JMBG; null = validan. */
export function jmbgProblem(
  value: string,
  rule: ControlRule = DEFAULT_CONTROL_RULE,
): JmbgProblem | null {
  const digits = compact(value);
  if (!/^\d{13}$/.test(digits)) return "length";
  if (!extractBirthDate(digits)) return "date";

  const expected = jmbgControlDigit(digits.slice(0, 12), rule);
  if (expected === null || expected !== Number(digits[12])) return "checksum";

  return null;
}

export function validateJmbg(
  value: string,
  rule: ControlRule = DEFAULT_CONTROL_RULE,
): boolean {
  return jmbgProblem(value, rule) === null;
}

/**
 * Datum rođenja iz prvih 7 cifara → ISO `YYYY-MM-DD`; null ako datum ne postoji.
 * Godina: 3 cifre su poslednje tri cifre godine, pa `982 → 1982`, `005 → 2005`
 * (granica 800 razdvaja 18xx/19xx od 2xxx).
 */
export function extractBirthDate(value: string): string | null {
  const digits = compact(value);
  if (!/^\d{7}/.test(digits)) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const yyy = Number(digits.slice(4, 7));
  const year = yyy >= 800 ? 1000 + yyy : 2000 + yyy;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
