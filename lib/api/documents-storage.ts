import { randomUUID } from "crypto";

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]/g;

/** Sanitizuje ime fajla za storage putanju. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(UNSAFE_CHARS, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}

/** Putanja u bucketu: {agencyId}/{clientId}/{uuid}-{filename} */
export function buildDocumentStoragePath(
  agencyId: string,
  clientId: string,
  filename: string,
): string {
  const safe = sanitizeFilename(filename);
  return `${agencyId}/${clientId}/${randomUUID()}-${safe}`;
}
