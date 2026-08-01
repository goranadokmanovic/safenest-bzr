/**
 * Predlog write akcije koji server pripremi, a klijent izvrši tek posle
 * potvrde — uvek kroz postojeću API rutu (nikad direktan upis iz alata).
 */

export type PendingActionExecute = {
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
};

export type PendingCreateFieldVisit = {
  kind: "createFieldVisit";
  summary: string;
  display: {
    client_name: string;
    worker_name: string;
    scheduled_at_label: string;
  };
  execute: PendingActionExecute & {
    method: "POST";
    path: "/api/field-visits";
  };
};

export type PendingUpdateComplianceExpiry = {
  kind: "updateComplianceRecordExpiry";
  summary: string;
  display: {
    client_name: string;
    subject_name: string;
    record_type_label: string;
    category: string;
    current_expiry_label: string | null;
    new_expiry_label: string;
  };
  execute: PendingActionExecute & {
    method: "PATCH";
  };
};

export type PendingAssignCollaborator = {
  kind: "assignCollaboratorToClient";
  summary: string;
  display: {
    client_name: string;
    collaborator_name: string;
    previous_collaborator_name: string | null;
  };
  execute: PendingActionExecute & {
    method: "PATCH";
  };
};

export type PendingAction =
  | PendingCreateFieldVisit
  | PendingUpdateComplianceExpiry
  | PendingAssignCollaborator;

export function isPendingAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "createFieldVisit" ||
    kind === "updateComplianceRecordExpiry" ||
    kind === "assignCollaboratorToClient"
  );
}
