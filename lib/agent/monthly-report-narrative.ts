/**
 * Kratki AI narativ za mesečni izveštaj klijenta.
 * Radi nad već sastavljenim structured JSON-om; pri grešci vraća null
 * (alat i dalje isporučuje brojke).
 */

const TIMEOUT_MS = 30_000;
const NARRATIVE_MODEL = "gpt-4o-mini";

export type MonthlyReportNarrativeLocale = "sr" | "en";

function languageLabel(locale: MonthlyReportNarrativeLocale): string {
  return locale === "en" ? "English" : "Serbian (Latin script)";
}

/**
 * Jedan kratak pasus (3–5 rečenica) samo na osnovu prosleđenih činjenica.
 * Ne baca — null ako API nije dostupan ili odgovor nije upotrebljiv.
 */
export async function generateMonthlyReportNarrative(
  structured: unknown,
  locale: MonthlyReportNarrativeLocale,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = [
    "You write a short monthly BZR (occupational safety) status summary for an agency user.",
    `Write exactly one paragraph of 3–5 sentences in ${languageLabel(locale)}.`,
    "Use ONLY the facts in the JSON. Do not invent visits, risks, people, or deadlines.",
    "Mention visit volume, risk trend if not insufficient_data, and compliance expiries in the period.",
    "Neutral, professional tone. No markdown, no bullet lists, no title.",
  ].join(" ");

  const userPrompt = `Structured monthly report data:\n${JSON.stringify(structured)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Jedan pasus — skini eventualne headingove / bullet ostatke.
    const cleaned = content
      .replace(/^#+\s.*/gm, "")
      .replace(/^[-*]\s+/gm, "")
      .replace(/\n+/g, " ")
      .trim();

    return cleaned || null;
  } catch {
    return null;
  }
}
