import { getVisitCountByAgencyUser } from "@/lib/agent/tools/get-visit-count";
import { getUpcomingDeadlines } from "@/lib/agent/tools/get-upcoming-deadlines";
import { getEmployeesWithoutComplianceRecords } from "@/lib/agent/tools/get-employees-without-records";
import { getClientSummary } from "@/lib/agent/tools/get-client-summary";
import { getMyAssignedClients } from "@/lib/agent/tools/get-my-assigned-clients";
import { searchFieldVisits } from "@/lib/agent/tools/search-field-visits";
import { createFieldVisit } from "@/lib/agent/tools/create-field-visit";
import { updateComplianceRecordExpiry } from "@/lib/agent/tools/update-compliance-expiry";
import { assignCollaboratorToClient } from "@/lib/agent/tools/assign-collaborator";
import type { AuthProfile } from "@/lib/api/session";
import {
  canMutateAgencyRecords,
  canMutateFieldRecords,
} from "@/lib/api/session";
import type { AgentTool, OpenAiToolDefinition } from "@/lib/agent/types";

/**
 * Read alati — izvršavaju se odmah.
 * Write alati — samo predlozi (`pendingAction`); server ih ne izvršava.
 */
const READ_TOOLS: readonly AgentTool[] = [
  getVisitCountByAgencyUser,
  getUpcomingDeadlines,
  getEmployeesWithoutComplianceRecords,
  getClientSummary,
  getMyAssignedClients,
  searchFieldVisits,
];

const WRITE_CREATE_VISIT: AgentTool = createFieldVisit;
const WRITE_COMPLIANCE: AgentTool = updateComplianceRecordExpiry;
const WRITE_ASSIGN: AgentTool = assignCollaboratorToClient;

/** Svi registrovani alati (za findTool); dostupnost po ulozi ide kroz toolsForProfile. */
export const AGENT_TOOLS: readonly AgentTool[] = [
  ...READ_TOOLS,
  WRITE_CREATE_VISIT,
  WRITE_COMPLIANCE,
  WRITE_ASSIGN,
];

/**
 * Alati koje model sme da vidi za datu ulogu.
 * - field_worker: read + createFieldVisit
 * - collaborator: + updateComplianceRecordExpiry
 * - owner: + assignCollaboratorToClient
 */
export function toolsForProfile(profile: AuthProfile): AgentTool[] {
  const tools: AgentTool[] = [...READ_TOOLS];

  if (canMutateFieldRecords(profile)) {
    tools.push(WRITE_CREATE_VISIT);
  }
  if (canMutateAgencyRecords(profile)) {
    tools.push(WRITE_COMPLIANCE);
  }
  if (profile.role === "agency_owner") {
    tools.push(WRITE_ASSIGN);
  }

  return tools;
}

export function toolDefinitionsForProfile(
  profile: AuthProfile,
): OpenAiToolDefinition[] {
  return toolsForProfile(profile).map((tool) => tool.definition);
}

/** @deprecated Koristi toolDefinitionsForProfile — ostavljeno za starije importe. */
export const TOOL_DEFINITIONS: OpenAiToolDefinition[] = AGENT_TOOLS.map(
  (tool) => tool.definition,
);

const BY_NAME = new Map<string, AgentTool>(
  AGENT_TOOLS.map((tool) => [tool.name, tool]),
);

export function findTool(
  name: string,
  profile?: AuthProfile,
): AgentTool | undefined {
  const tool = BY_NAME.get(name);
  if (!tool) return undefined;
  if (!profile) return tool;
  return toolsForProfile(profile).some((t) => t.name === name)
    ? tool
    : undefined;
}
