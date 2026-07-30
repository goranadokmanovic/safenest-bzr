/** Dozvoljene vrednosti enum field_visit_status u bazi */
export type FieldVisitStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "cancelled";
export type FieldVisitMetadata = {
  duration_hours?: number;
  risk_level?: string;
  extracted_text?: string;
  [key: string]: unknown;
};

/** Red iz tabele field_visits (tačna šema baze) */
export type FieldVisit = {
  id: string;
  created_at: string;
  updated_at: string;
  agency_id: string;
  client_company_id: string;
  assigned_user_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: FieldVisitStatus;
  sync_status: string;
  offline_client_id: string | null;
  notes: string | null;
  metadata: FieldVisitMetadata | null;
  audio_url: string | null;
  transcript: string | null;
  transcript_status: "pending" | "processing" | "done" | "failed";
  noise_mode: "quiet" | "noisy" | null;
  report_template_id: string | null;
  report: string | null;
  report_fields: Record<string, string> | null;
  report_status: "pending" | "processing" | "done" | "failed" | "skipped";
  report_lock_status: "in_progress" | "closed";
  report_closed_at: string | null;
  report_closed_by: string | null;
  reopen_requested_at: string | null;
  reopen_requested_by: string | null;
  reopen_justification: string | null;
  reopen_approved_by: string | null;
  reopen_approved_at: string | null;
  /** Tekstualni trag digitalnog potpisa; signed_by/at = report_closed_by/at. */
  signature_statement: string | null;
  report_content_hash: string | null;
  broj_naloga: string;
  hitno_otklanjanje: boolean;
  parent_visit_id: string | null;
};

/** Payload za kreiranje posete (POST /api/field-visits ili offline sync) */
export type FieldVisitInsertPayload = {
  client_company_id: string;
  assigned_user_id?: string | null;
  scheduled_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  status?: FieldVisitStatus;
  sync_status?: string;
  offline_client_id?: string | null;
  notes?: string | null;
  metadata?: FieldVisitMetadata | null;
  report_template_id?: string | null;
  hitno_otklanjanje?: boolean;
  parent_visit_id?: string | null;
};

/** Fotografija terenske posete za prikaz u UI (server ili lokalno). */
export type FieldVisitPhotoDisplay = {
  id: string;
  url: string;
  label: string;
  ocr_text: string | null;
  ocr_confidence: number | null;
  extracted_dates: Record<string, unknown> | null;
  /** Lokalna slika još nije uploadovana na Storage. */
  pendingUpload?: boolean;
};
