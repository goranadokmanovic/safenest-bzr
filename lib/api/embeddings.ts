/**
 * Generisanje embedding vektora preko OpenAI API-ja (text-embedding-3-small).
 * Koristi se i pri upisu terenske posete (indeksiranje) i pri pretrazi (upit).
 */

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDING_DIMENSIONS = 1536;

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Vraća embedding vektor (niz od 1536 brojeva) za dati tekst.
 * Vraća null ako je tekst prazan (nema šta da se indeksira).
 */
export async function generateEmbedding(
  text: string | null | undefined,
): Promise<number[] | null> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("OPENAI_API_KEY nije podešen u .env.local.");
  }

  // OpenAI ima limit od ~8191 tokena po embedding pozivu — grubo sečemo
  // na ~20000 karaktera (bezbedna margina, ne moramo tačno brojati tokene).
  const safeText = trimmed.slice(0, 20000);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: safeText,
      dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmbeddingError(
      `OpenAI embeddings poziv nije uspeo (${res.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
  };

  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      `Neočekivan odgovor od OpenAI (dužina vektora: ${embedding?.length ?? "N/A"}).`,
    );
  }

  return embedding;
}

/**
 * Spaja polja terenske posete u jedan tekst pogodan za embedding.
 * Poziva se i pri kreiranju posete i pri ažuriranju OCR teksta fotografija.
 */
export function buildVisitEmbeddingText(input: {
  clientName?: string | null;
  notes?: string | null;
  riskLevel?: string | null;
  extractedText?: string | null;
  ocrTexts?: (string | null | undefined)[];
}): string {
  const parts: string[] = [];

  if (input.clientName) parts.push(`Klijent: ${input.clientName}`);
  if (input.riskLevel) parts.push(`Nivo rizika: ${input.riskLevel}`);
  if (input.notes) parts.push(`Napomene: ${input.notes}`);
  if (input.extractedText) parts.push(`Ekstraktovani tekst: ${input.extractedText}`);

  const ocrCombined = (input.ocrTexts ?? [])
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (ocrCombined) parts.push(`OCR sa fotografija: ${ocrCombined}`);

  return parts.join("\n\n");
}

/**
 * Pretvara JS niz brojeva u Postgres vector literal (za direktan SQL upis
 * ili prosleđivanje kroz Supabase klijent kao string).
 */
export function embeddingToSqlLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}