import type { PendingAction } from "@/lib/agent/pending-action";
import type { ToolTrace } from "@/components/agencija/asistent/ToolTraceCard";

/**
 * In-memory session store for the floating Zrna panel.
 * Survives AgencyShell remounts within the same tab.
 *
 * - Chat fields: cleared via clearZrnaPanelChat() (Novi razgovor / logout)
 * - open: independent of route; reset on logout via setZrnaPanelOpen(false)
 */

export type ZrnaPanelChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTrace[];
  pendingAction?: PendingAction | null;
};

type ZrnaPanelChatState = {
  entries: ZrnaPanelChatEntry[];
  input: string;
  error: string | null;
};

const emptyChatState = (): ZrnaPanelChatState => ({
  entries: [],
  input: "",
  error: null,
});

let chatState: ZrnaPanelChatState = emptyChatState();
const chatListeners = new Set<() => void>();

function emitChat() {
  for (const listener of chatListeners) listener();
}

export function getZrnaPanelChatState(): ZrnaPanelChatState {
  return chatState;
}

export function subscribeZrnaPanelChat(listener: () => void): () => void {
  chatListeners.add(listener);
  return () => {
    chatListeners.delete(listener);
  };
}

export function setZrnaPanelChatEntries(
  entries:
    | ZrnaPanelChatEntry[]
    | ((prev: ZrnaPanelChatEntry[]) => ZrnaPanelChatEntry[]),
) {
  chatState = {
    ...chatState,
    entries:
      typeof entries === "function" ? entries(chatState.entries) : entries,
  };
  emitChat();
}

export function setZrnaPanelChatInput(input: string) {
  if (chatState.input === input) return;
  chatState = { ...chatState, input };
  emitChat();
}

export function setZrnaPanelChatError(error: string | null) {
  if (chatState.error === error) return;
  chatState = { ...chatState, error };
  emitChat();
}

export function clearZrnaPanelChat() {
  chatState = emptyChatState();
  emitChat();
}

/** Panel visibility — not tied to pathname; survives remounts. */
let panelOpen = false;
const openListeners = new Set<() => void>();

function emitOpen() {
  for (const listener of openListeners) listener();
}

export function getZrnaPanelOpen(): boolean {
  return panelOpen;
}

export function subscribeZrnaPanelOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function setZrnaPanelOpen(open: boolean) {
  if (panelOpen === open) return;
  panelOpen = open;
  emitOpen();
}
