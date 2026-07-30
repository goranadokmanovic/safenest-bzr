/** Centralna konfiguracija offline-first sloja (Phase 2). */

export const OFFLINE_DB_NAME = "safenest-bzr-offline";

/** Tabele koje se uređuju offline i sinhronizuju ka serveru. */
export const SYNCABLE_TABLES = [
  "field_visits",
  "field_photos",
  "voice_recordings",
  "documents",
  "risk_assessments",
  "team_messages",
] as const;

/** Read-only referentne tabele koje se repliciraju sa servera. */
export const REFERENCE_TABLES = [
  "agencies",
  "client_companies",
  "employees",
] as const;

/** Interni store-ovi (ne sinhronizuju se direktno). */
export const INTERNAL_STORES = ["_sync_queue", "ocr_results", "_meta"] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
export type ReferenceTable = (typeof REFERENCE_TABLES)[number];

export function isOfflineEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_OFFLINE === "true";
}

export function getSyncIntervalMs(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SYNC_INTERVAL);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 5000;
}

/**
 * Mapira jednostavnu oznaku jezika u tesseract kod.
 * "sr" → latinica + ćirilica (`srp_latn+srp`): terenski dokumenti su
 * najčešće latinica; samo `srp` (ćirilica) na latiničnom tekstu daje haos.
 * Može se override-ovati npr. NEXT_PUBLIC_OCR_LANGUAGE=srp_latn ili srp+eng.
 */
export function getOcrLanguage(): string {
  const raw = (process.env.NEXT_PUBLIC_OCR_LANGUAGE || "sr").trim();
  if (raw === "sr") return "srp_latn+srp";
  if (raw === "en") return "eng";
  return raw;
}

export const MAX_SYNC_RETRIES = 3;

/** Exponential backoff: 1s, 2s, 4s ... */
export function backoffDelayMs(retries: number): number {
  return Math.min(1000 * 2 ** retries, 30_000);
}
