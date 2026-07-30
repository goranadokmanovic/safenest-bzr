export type ComplianceRecordType =
  | "medical_exam"
  | "training_certification"
  | "equipment_check";

export type ComplianceSubjectType = "worker" | "equipment";

export type ComplianceRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  agency_id: string;
  client_company_id: string;
  record_type: ComplianceRecordType;
  subject_type: ComplianceSubjectType;
  subject_id: string | null;
  subject_name: string;
  category: string;
  issued_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  notes: string | null;
};

export type ComplianceStatusKind =
  | "missing"
  | "expired"
  | "expiring"
  | "valid";

export type ComplianceStatus = {
  kind: ComplianceStatusKind;
  daysRemaining: number | null;
};

/** Fiksne kategorije po tipu zapisa. */
export const COMPLIANCE_CATEGORIES: Record<
  ComplianceRecordType,
  readonly string[]
> = {
  medical_exam: [
    "Opšti lekarski pregled",
    "Oftalmološki pregled",
    "Psihološki pregled",
    "Audiometrijski pregled",
    "Spirometrijski pregled",
    "Neurološki pregled",
    "Dermatološki pregled",
    "Ostali lekarski pregledi u skladu sa zakonom",
  ],
  training_certification: [
    "Opšte osposobljavanje (pri zapošljavanju)",
    "Osposobljavanje za rad na opremi",
    "Osposobljavanje pri promeni radnog mesta",
    "Periodična provera osposobljenosti",
    "Obuka za pružanje prve pomoći",
    "Protivpožarna obuka",
  ],
  equipment_check: [
    "Periodični pregled",
    "Vanredni pregled",
    "Ispitivanje ispravnosti",
  ],
} as const;

export const RECORD_TYPE_SUBJECT: Record<
  ComplianceRecordType,
  ComplianceSubjectType
> = {
  medical_exam: "worker",
  training_certification: "worker",
  equipment_check: "equipment",
};

/** Kalendarski dan u Europe/Belgrade (YYYY-MM-DD). */
export function todayBelgradeIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDateOnly(value: string): number {
  // Interpret as local midnight of date-only string
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function getComplianceStatus(
  expiryDate: string | null | undefined,
  todayIso: string = todayBelgradeIso(),
): ComplianceStatus {
  if (!expiryDate?.trim()) {
    return { kind: "missing", daysRemaining: null };
  }

  const expiry = parseDateOnly(expiryDate.trim());
  const today = parseDateOnly(todayIso);
  const days = Math.round((expiry - today) / (24 * 60 * 60 * 1000));

  if (days <= 0) {
    return { kind: "expired", daysRemaining: days };
  }
  if (days <= 30) {
    return { kind: "expiring", daysRemaining: days };
  }
  return { kind: "valid", daysRemaining: days };
}

export function isComplianceRecordType(
  value: unknown,
): value is ComplianceRecordType {
  return (
    value === "medical_exam" ||
    value === "training_certification" ||
    value === "equipment_check"
  );
}
