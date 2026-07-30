import { getVisitCountByAgencyUser } from "@/lib/agent/tools/get-visit-count";
import { getUpcomingDeadlines } from "@/lib/agent/tools/get-upcoming-deadlines";
import { getEmployeesWithoutComplianceRecords } from "@/lib/agent/tools/get-employees-without-records";
import { getClientSummary } from "@/lib/agent/tools/get-client-summary";
import { searchFieldVisits } from "@/lib/agent/tools/search-field-visits";
import type { AgentTool, OpenAiToolDefinition } from "@/lib/agent/types";

/**
 * Faza A — samo alati za čitanje. Nijedan ne menja podatke, pa se izvršavaju
 * bez potvrde korisnika. Write alati (Faza B) dolaze kao predlozi koje server
 * ne izvršava, već ih UI šalje na potvrdu.
 */
export const AGENT_TOOLS: readonly AgentTool[] = [
  getVisitCountByAgencyUser,
  getUpcomingDeadlines,
  getEmployeesWithoutComplianceRecords,
  getClientSummary,
  searchFieldVisits,
];

export const TOOL_DEFINITIONS: OpenAiToolDefinition[] = AGENT_TOOLS.map(
  (tool) => tool.definition,
);

const BY_NAME = new Map<string, AgentTool>(
  AGENT_TOOLS.map((tool) => [tool.name, tool]),
);

export function findTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name);
}
