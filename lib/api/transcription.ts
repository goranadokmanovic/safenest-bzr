import { MAX_TRANSCRIPTION_AUDIO_BYTES } from "@/lib/api/audio-storage";
import { normalizeLocale, type Locale } from "@/lib/i18n";

export type NoiseMode = "quiet" | "noisy";

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

/** Kratki kontekst/rečnik — pomaže modelu da pogodi BZR termine umesto sličnih pogrešnih reči. */
export function transcriptionPromptForLocale(language: Locale): string {
  if (language === "en") {
    return (
      "Occupational health and safety (OHS) field inspection report in English. " +
      "Domain terms: finding, risk, recommendation, digital signature, report, " +
      "inspection, control visit, remediation, urgent remediation, order number, " +
      "industry, risk level, field visit, client, note."
    );
  }
  return (
    "Zapisnik o bezbednosnoj inspekciji na srpskom jeziku. " +
    "Termini: nalaz, rizik, preporuka, digitalni potpis, zapisnik, kontrola, " +
    "kontrolna poseta, otklanjanje, hitno otklanjanje, broj naloga, delatnost, " +
    "nivo rizika, terenska poseta, klijent, napomena."
  );
}

function isUnavailableModel(status: number, body: string): boolean {
  return (
    [400, 403, 404].includes(status) &&
    /model|access|permission|not found|does not exist/i.test(body)
  );
}

async function callOpenAi(
  apiKey: string,
  audio: Blob,
  filename: string,
  model: string,
  language: Locale,
  prompt: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", model);
  form.append("language", language);
  form.append("prompt", prompt);
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  const body = await response.text();
  if (!response.ok) {
    if (isUnavailableModel(response.status, body)) {
      throw new TranscriptionError(`MODEL_UNAVAILABLE:${body}`, response.status);
    }
    throw new TranscriptionError(
      `OpenAI transcription nije uspela (${response.status}): ${body.slice(0, 500)}`,
      502,
    );
  }

  let parsed: { text?: unknown };
  try {
    parsed = JSON.parse(body) as { text?: unknown };
  } catch {
    throw new TranscriptionError("OpenAI je vratio nevažeći odgovor.");
  }

  if (typeof parsed.text !== "string") {
    throw new TranscriptionError("OpenAI odgovor ne sadrži transkript.");
  }
  return parsed.text.trim();
}

export async function transcribeAudio(input: {
  audio: Blob;
  filename: string;
  noiseMode: NoiseMode;
  /** ISO-639-1 kod iz app locale-a (`sr` | `en`). */
  language?: Locale | string | null;
}): Promise<{ transcript: string; model: string; language: Locale }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError(
      "OPENAI_API_KEY nije podešen u .env.local.",
      503,
    );
  }
  if (input.audio.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new TranscriptionError(
      "Audio fajl prelazi OpenAI limit od 25 MB. Snimite kraću belešku.",
      413,
    );
  }

  const language = normalizeLocale(input.language);
  const prompt = transcriptionPromptForLocale(language);
  const primaryModel =
    input.noiseMode === "quiet"
      ? "gpt-4o-mini-transcribe"
      : "gpt-4o-transcribe";

  try {
    const transcript = await callOpenAi(
      apiKey,
      input.audio,
      input.filename,
      primaryModel,
      language,
      prompt,
    );
    return { transcript, model: primaryModel, language };
  } catch (error) {
    const canFallback =
      input.noiseMode === "noisy" &&
      error instanceof TranscriptionError &&
      error.message.startsWith("MODEL_UNAVAILABLE:");
    if (!canFallback) throw error;

    const fallbackModel = "whisper-1";
    const transcript = await callOpenAi(
      apiKey,
      input.audio,
      input.filename,
      fallbackModel,
      language,
      prompt,
    );
    return { transcript, model: fallbackModel, language };
  }
}
