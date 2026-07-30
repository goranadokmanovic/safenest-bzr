import { randomUUID } from "crypto";

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]/g;

export function sanitizeImageFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "photo.jpg";
  const cleaned = base.replace(UNSAFE_CHARS, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "photo.jpg";
}

/** Putanja u bucketu field-photos: {agencyId}/{fieldVisitId}/{uuid}-{filename} */
export function buildPhotoStoragePath(
  agencyId: string,
  fieldVisitId: string,
  filename: string,
): string {
  const safe = sanitizeImageFilename(filename);
  return `${agencyId}/${fieldVisitId}/${randomUUID()}-${safe}`;
}

export const FIELD_PHOTOS_BUCKET = "field-photos";

/** Trajanje signed URL-a upisanog u photo_url (7 dana, kao voice_recordings). */
export const FIELD_PHOTO_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

/** Red iz tabele field_photos (stvarna šema). */
export type FieldPhotoRow = {
  id: string;
  field_visit_id: string;
  photo_url: string;
  extracted_dates: Record<string, unknown> | null;
  ocr_confidence: number | null;
  ocr_text: string | null;
  created_at?: string;
};

/** Ime fajla za prikaz — iz URL-a ili fallback. */
export function displayNameFromPhotoUrl(photoUrl: string, id: string): string {
  try {
    const path = new URL(photoUrl).pathname;
    const segment = path.split("/").pop() ?? "";
    const withoutUuid = segment.replace(
      /^[0-9a-f-]{36}-/i,
      "",
    );
    if (withoutUuid) return decodeURIComponent(withoutUuid);
  } catch {
    /* relative URL ili blob */
  }
  const tail = photoUrl.split("/").pop() ?? "";
  if (tail) return tail;
  return `photo-${id.slice(0, 8)}`;
}

/** Strukturirane datume iz OCR teksta (ISO i DD.MM.YYYY). */
export function buildExtractedDatesFromOcr(
  text: string | null | undefined,
): Record<string, unknown> {
  if (!text?.trim()) return { dates: [] };
  const found = new Set<string>();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/g);
  const dmy = text.match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g);
  if (iso) iso.forEach((d) => found.add(d));
  if (dmy) dmy.forEach((d) => found.add(d));
  return { dates: [...found] };
}
