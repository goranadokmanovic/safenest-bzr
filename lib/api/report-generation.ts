import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import {
  emptyLabelForLocale,
  emptyReportFields,
  mergeFilledReportFields,
  normalizeReportFields,
  parseReportTextToFields,
  parseTemplateFieldNames,
  reportFieldsToText,
  type ReportFields,
} from "@/lib/api/report-fields";

export type ReportStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "skipped";

export class ReportGenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

function languageInstruction(locale: Locale): string {
  return locale === "en"
    ? "Write all field values in English."
    : "Napiši sve vrednosti polja na srpskom jeziku (latinica).";
}

async function callChatJson(input: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ReportGenerationError(
      "OPENAI_API_KEY nije podešen u .env.local.",
      503,
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new ReportGenerationError(
      `OpenAI report generation nije uspela (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  let parsed: {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new ReportGenerationError("OpenAI je vratio nevažeći odgovor.");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ReportGenerationError("OpenAI odgovor ne sadrži JSON.");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ReportGenerationError("OpenAI JSON nije validan.");
  }
}

function coerceFieldsFromAi(
  raw: unknown,
  fieldNames: string[],
  emptyLabel: string,
): ReportFields {
  const base = emptyReportFields(fieldNames, emptyLabel);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;

  const obj = raw as Record<string, unknown>;
  // Dozvoli omotač { fields: {...} } ili direktan objekat polja
  const source =
    obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)
      ? (obj.fields as Record<string, unknown>)
      : obj;

  for (const name of fieldNames) {
    const direct = source[name];
    if (typeof direct === "string") {
      base[name] = direct.trim() || emptyLabel;
      continue;
    }
    const found = Object.entries(source).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    );
    if (found && typeof found[1] === "string") {
      base[name] = found[1].trim() || emptyLabel;
    }
  }
  return base;
}

export async function generateStructuredReport(input: {
  templateContent: string;
  transcript: string;
  language?: Locale | string | null;
}): Promise<{ fields: ReportFields; reportText: string }> {
  const language = normalizeLocale(input.language);
  const template = input.templateContent.trim();
  const transcript = input.transcript.trim();
  if (!template) {
    throw new ReportGenerationError("Šablon je prazan.", 400);
  }
  if (!transcript) {
    throw new ReportGenerationError("Transkript je prazan.", 400);
  }

  const fieldNames = parseTemplateFieldNames(template);
  if (fieldNames.length === 0) {
    throw new ReportGenerationError(
      "Šablon nema prepoznatljiva polja (očekivan format: \"Naziv polja:\").",
      400,
    );
  }

  const emptyLabel = emptyLabelForLocale(language);

  const systemPrompt = [
    "You are an occupational safety (BZR) field report assistant.",
    "Fill a JSON object with exactly the provided field names as keys.",
    "Do not invent facts that are not supported by the transcript.",
    `If a field has no information in the transcript, set its value to "${emptyLabel}".`,
    "Return JSON only, either as {\"fields\":{...}} or a flat object of field keys.",
    languageInstruction(language),
  ].join(" ");

  const userPrompt = [
    "FIELD NAMES (use these keys exactly):",
    JSON.stringify(fieldNames),
    "",
    "TEMPLATE / STRUCTURE:",
    template,
    "",
    "RAW TRANSCRIPT:",
    transcript,
    "",
    "Return the completed fields JSON now.",
  ].join("\n");

  const raw = await callChatJson({ systemPrompt, userPrompt });
  const fields = coerceFieldsFromAi(raw, fieldNames, emptyLabel);
  return { fields, reportText: reportFieldsToText(fields) };
}

export async function fillReportFieldsFromTranscript(input: {
  fieldNames: string[];
  currentFields: ReportFields;
  transcript: string;
  language?: Locale | string | null;
}): Promise<ReportFields> {
  const language = normalizeLocale(input.language);
  const transcript = input.transcript.trim();
  if (!transcript) {
    throw new ReportGenerationError("Transkript dodatnog unosa je prazan.", 400);
  }
  if (input.fieldNames.length === 0) {
    throw new ReportGenerationError("Nema polja šablona za popunjavanje.", 400);
  }

  const systemPrompt = [
    "You update structured BZR report fields from an additional voice transcript.",
    "The user mentions field names and values (e.g. \"Delatnost, prodaja tekstila\").",
    "Return a JSON object with ONLY the fields that were explicitly mentioned and should be updated.",
    "Do NOT include fields that were not mentioned.",
    "Do NOT clear or overwrite other fields — omit them from the response.",
    "Keys must match the provided field names when possible.",
    "Return JSON as {\"fields\":{...}} or a flat object.",
    languageInstruction(language),
  ].join(" ");

  const userPrompt = [
    "FIELD NAMES:",
    JSON.stringify(input.fieldNames),
    "",
    "CURRENT FIELDS:",
    JSON.stringify(input.currentFields, null, 2),
    "",
    "ADDITIONAL VOICE TRANSCRIPT:",
    transcript,
    "",
    "Return only the fields to update.",
  ].join("\n");

  const raw = await callChatJson({ systemPrompt, userPrompt });
  const sparse: ReportFields = {};

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const source =
      obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)
        ? (obj.fields as Record<string, unknown>)
        : obj;
    for (const [k, v] of Object.entries(source)) {
      if (k === "fields" || typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      const target =
        input.fieldNames.find((n) => n.toLowerCase() === k.toLowerCase()) ??
        null;
      if (target) sparse[target] = trimmed;
    }
  }

  return mergeFilledReportFields(
    input.currentFields,
    sparse,
    input.fieldNames,
  );
}

/**
 * Best-effort generisanje zapisnika za posetu. Postavlja report_status kroz tok.
 * Ako nema template-a ili transkripta, status ide u 'skipped'.
 */
export async function generateAndSaveVisitReport(
  supabase: SupabaseClient,
  visitId: string,
  language: Locale,
): Promise<{
  report: string | null;
  report_fields: ReportFields | null;
  report_status: ReportStatus;
  skipped?: boolean;
}> {
  const { data: visit, error: visitError } = await supabase
    .from("field_visits")
    .select("id, transcript, report_template_id, report_status, report_lock_status")
    .eq("id", visitId)
    .maybeSingle();

  if (visitError || !visit) {
    throw new ReportGenerationError(
      visitError?.message ?? "Terenska poseta nije pronađena.",
      404,
    );
  }

  if (visit.report_lock_status === "closed") {
    throw new ReportGenerationError(
      "Zapisnik je zatvoren i ne može se generisati ponovo.",
      409,
    );
  }

  if (!visit.report_template_id) {
    await supabase
      .from("field_visits")
      .update({ report_status: "skipped", report: null, report_fields: null })
      .eq("id", visitId);
    return {
      report: null,
      report_fields: null,
      report_status: "skipped",
      skipped: true,
    };
  }

  const transcript =
    typeof visit.transcript === "string" ? visit.transcript.trim() : "";
  if (!transcript) {
    await supabase
      .from("field_visits")
      .update({ report_status: "skipped" })
      .eq("id", visitId);
    return {
      report: null,
      report_fields: null,
      report_status: "skipped",
      skipped: true,
    };
  }

  const { data: template, error: templateError } = await supabase
    .from("report_templates")
    .select("id, template_content")
    .eq("id", visit.report_template_id)
    .maybeSingle();

  if (templateError || !template?.template_content) {
    await supabase
      .from("field_visits")
      .update({ report_status: "failed" })
      .eq("id", visitId);
    throw new ReportGenerationError(
      templateError?.message ?? "Šablon zapisnika nije pronađen.",
      404,
    );
  }

  const { error: processingError } = await supabase
    .from("field_visits")
    .update({ report_status: "processing" })
    .eq("id", visitId);
  if (processingError) {
    throw new ReportGenerationError(processingError.message, 400);
  }

  try {
    const { fields, reportText } = await generateStructuredReport({
      templateContent: template.template_content,
      transcript,
      language,
    });

    const { error: saveError } = await supabase
      .from("field_visits")
      .update({
        report: reportText,
        report_fields: fields,
        report_status: "done",
      })
      .eq("id", visitId);
    if (saveError) {
      throw new ReportGenerationError(saveError.message, 400);
    }

    return {
      report: reportText,
      report_fields: fields,
      report_status: "done",
    };
  } catch (error) {
    await supabase
      .from("field_visits")
      .update({ report_status: "failed" })
      .eq("id", visitId);
    throw error;
  }
}

export function fieldsFromVisitRow(visit: {
  report?: string | null;
  report_fields?: unknown;
  template_content?: string | null;
}): ReportFields | null {
  const fieldNames = visit.template_content
    ? parseTemplateFieldNames(visit.template_content)
    : undefined;
  const fromJson = normalizeReportFields(visit.report_fields, fieldNames);
  if (fromJson) return fromJson;
  if (visit.report?.trim()) {
    return parseReportTextToFields(visit.report, fieldNames);
  }
  return null;
}
