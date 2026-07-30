import { randomUUID } from "crypto";

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]/g;

export const FIELD_AUDIO_BUCKET = "field-audio";
export const MAX_TRANSCRIPTION_AUDIO_BYTES = 25 * 1024 * 1024;
/** Trajanje signed URL-a za HTML5 audio player (7 dana). */
export const FIELD_AUDIO_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

export function sanitizeAudioFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "recording.webm";
  const cleaned = base.replace(UNSAFE_CHARS, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "recording.webm";
}

/** Putanja: {agencyId}/{fieldVisitId}/{uuid}-{filename}. */
export function buildAudioStoragePath(
  agencyId: string,
  fieldVisitId: string,
  filename: string,
): string {
  return `${agencyId}/${fieldVisitId}/${randomUUID()}-${sanitizeAudioFilename(filename)}`;
}
