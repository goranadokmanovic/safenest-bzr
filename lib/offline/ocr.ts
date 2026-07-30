import { internalStore } from "@/lib/offline/indexedDB";
import { getOcrLanguage } from "@/lib/offline/config";
import type { OcrResult } from "@/lib/offline/types";

const OCR_STORE = "ocr_results";

export type OcrExtraction = {
  text: string;
  confidence: number | null;
};

/**
 * Lokalna OCR ekstrakcija teksta iz slike preko tesseract.js (bez eksternih API-ja).
 * Rezultat se kešira u IndexedDB pod `ocr_results`.
 */
export async function extractTextFromImage(
  file: File | Blob,
  options?: { id?: string; filename?: string },
): Promise<OcrExtraction> {
  if (typeof window === "undefined") {
    throw new Error("OCR je dostupan samo u browseru.");
  }

  // Dinamički import — tesseract se učitava tek kada zatreba (smanjuje bundle).
  const Tesseract = (await import("tesseract.js")).default;
  const lang = getOcrLanguage();

  const result = await Tesseract.recognize(file, lang);
  const text = result?.data?.text?.trim() ?? "";
  const confidenceRaw = result?.data?.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.round(confidenceRaw * 10) / 10
      : null;

  const filename =
    options?.filename ?? (file instanceof File ? file.name : "image");
  const id = options?.id ?? crypto.randomUUID();

  const record: OcrResult = {
    id,
    filename,
    text,
    createdAt: Date.now(),
  };
  await internalStore(OCR_STORE).setItem(id, record);

  return { text, confidence };
}

export async function getOcrResult(id: string): Promise<OcrResult | null> {
  return (await internalStore(OCR_STORE).getItem<OcrResult>(id)) ?? null;
}

export async function getAllOcrResults(): Promise<OcrResult[]> {
  const out: OcrResult[] = [];
  await internalStore(OCR_STORE).iterate<OcrResult, void>((v) => {
    out.push(v);
  });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
