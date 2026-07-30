import { randomUUID } from "crypto";

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]/g;

export function sanitizeAudioFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "recording.webm";
  const cleaned = base.replace(UNSAFE_CHARS, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "recording.webm";
}

/** Putanja u bucketu voice-recordings: {agencyId}/{uuid}-{filename} */
export function buildVoiceStoragePath(
  agencyId: string,
  filename: string,
): string {
  const safe = sanitizeAudioFilename(filename);
  return `${agencyId}/${randomUUID()}-${safe}`;
}

export const VOICE_RECORDINGS_BUCKET = "voice-recordings";
