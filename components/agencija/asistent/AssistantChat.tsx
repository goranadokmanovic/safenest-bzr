"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { ActionConfirmCard } from "@/components/agencija/asistent/ActionConfirmCard";
import {
  ToolTraceCard,
  type ToolTrace,
} from "@/components/agencija/asistent/ToolTraceCard";
import { ZrnaShield } from "@/components/brand/ZrnaShield";
import {
  isPendingAction,
  type PendingAction,
} from "@/lib/agent/pending-action";
import {
  clearZrnaPanelChat,
  getZrnaPanelChatState,
  setZrnaPanelChatEntries,
  setZrnaPanelChatError,
  setZrnaPanelChatInput,
  subscribeZrnaPanelChat,
  type ZrnaPanelChatEntry,
} from "@/lib/agent/zrna-panel-chat-store";

/** Mora da prati MAX_HISTORY_MESSAGES u app/api/assistant/chat/route.ts. */
const MAX_HISTORY_MESSAGES = 20;

type ChatEntry = ZrnaPanelChatEntry;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clearPending(entries: ChatEntry[]): ChatEntry[] {
  return entries.map((e) =>
    e.pendingAction ? { ...e, pendingAction: null } : e,
  );
}

function ThinkingStatus({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2.5" role="status">
      <ZrnaShield size="sm" />
      <p className="bzr-zrna-thinking pt-1">
        <span>{label}</span>
        <span className="bzr-zrna-thinking__dots" aria-hidden>
          <span className="bzr-zrna-thinking__dot" />
          <span className="bzr-zrna-thinking__dot" />
          <span className="bzr-zrna-thinking__dot" />
        </span>
      </p>
    </div>
  );
}

export function AssistantChat({
  variant = "page",
  autoFocus = false,
  inputId = "assistant-input",
}: {
  /** page = puna ruta; panel = plutajući overlay. */
  variant?: "page" | "panel";
  autoFocus?: boolean;
  inputId?: string;
} = {}) {
  const { m, locale } = useTranslations();
  const a = m.dashboard.assistant;
  const compact = variant === "panel";
  const persistPanel = variant === "panel";

  const panelState = useSyncExternalStore(
    subscribeZrnaPanelChat,
    getZrnaPanelChatState,
    getZrnaPanelChatState,
  );

  const [localEntries, setLocalEntries] = useState<ChatEntry[]>([]);
  const [localInput, setLocalInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const entries = persistPanel ? panelState.entries : localEntries;
  const input = persistPanel ? panelState.input : localInput;
  const error = persistPanel ? panelState.error : localError;

  const setEntries = useCallback(
    (
      next:
        | ChatEntry[]
        | ((prev: ChatEntry[]) => ChatEntry[]),
    ) => {
      if (persistPanel) setZrnaPanelChatEntries(next);
      else setLocalEntries(next);
    },
    [persistPanel],
  );

  const setInput = useCallback(
    (next: string) => {
      if (persistPanel) setZrnaPanelChatInput(next);
      else setLocalInput(next);
    },
    [persistPanel],
  );

  const setError = useCallback(
    (next: string | null) => {
      if (persistPanel) setZrnaPanelChatError(next);
      else setLocalError(next);
    },
    [persistPanel],
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, loading]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  const send = useCallback(
    async (rawText: string) => {
      const question = rawText.trim();
      if (!question || loading) return;

      const userEntry: ChatEntry = {
        id: newId(),
        role: "user",
        content: question,
      };

      // Nova poruka otkazuje nepotvrđen predlog — prirodnije od blokade send-a.
      const nextEntries = [...clearPending(entries), userEntry];

      setEntries(nextEntries);
      setInput("");
      setError(null);
      setLoading(true);

      const payload = nextEntries
        .slice(-MAX_HISTORY_MESSAGES)
        .map((e) => ({ role: e.role, content: e.content }));

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload, locale }),
        });

        const json = (await res.json().catch(() => ({}))) as {
          reply?: string;
          toolTrace?: ToolTrace[];
          pending_action?: unknown;
          error?: string;
        };

        if (!res.ok || !json.reply) {
          setError(json.error ?? m.common.error);
          return;
        }

        const pending = isPendingAction(json.pending_action)
          ? json.pending_action
          : null;

        setEntries((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: json.reply!,
            toolTrace: json.toolTrace ?? [],
            pendingAction: pending,
          },
        ]);
      } catch {
        setError(m.common.networkError);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [entries, loading, locale, m.common.error, m.common.networkError],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function resetChat() {
    if (persistPanel) clearZrnaPanelChat();
    else {
      setLocalEntries([]);
      setLocalError(null);
      setLocalInput("");
    }
    inputRef.current?.focus();
  }

  function handleConfirmed(entryId: string, successMessage: string) {
    setEntries((prev) => [
      ...prev.map((e) =>
        e.id === entryId ? { ...e, pendingAction: null } : e,
      ),
      {
        id: newId(),
        role: "assistant",
        content: successMessage,
      },
    ]);
  }

  function handleCancelled(entryId: string) {
    setEntries((prev) => [
      ...prev.map((e) =>
        e.id === entryId ? { ...e, pendingAction: null } : e,
      ),
      {
        id: newId(),
        role: "assistant",
        content: a.confirm.cancelled,
      },
    ]);
  }

  const isEmpty = entries.length === 0;
  const trimmed = entries.length > MAX_HISTORY_MESSAGES;

  return (
    <div
      className={`flex flex-col gap-4 ${compact ? "mt-0 min-h-0 flex-1" : "mt-6"}`}
    >
      <div
        className={`space-y-5 ${compact ? "min-h-0 flex-1 overflow-y-auto pr-1" : "min-h-[18rem]"}`}
        role="log"
        aria-live="polite"
        aria-label={a.title}
      >
        {isEmpty ? (
          <div
            className={`rounded-xl border border-border/40 bg-surface/60 ${compact ? "p-3" : "p-5"}`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">{a.emptyTitle}</p>
              <p className="mt-1 text-sm text-ink/70">{a.emptyHint}</p>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {a.suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void send(suggestion)}
                    disabled={loading}
                    className="rounded-full border border-accent/25 bg-accent/5 px-3 py-1.5 text-xs text-ink/80 transition hover:border-accent/50 hover:text-ink disabled:opacity-60"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {entries.map((entry) =>
          entry.role === "user" ? (
            <div key={entry.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-accent/25 bg-accent/10 px-4 py-2.5">
                <p className="sr-only">{a.roleYou}</p>
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {entry.content}
                </p>
              </div>
            </div>
          ) : (
            <div key={entry.id} className="flex max-w-[95%] items-start gap-2.5">
              <ZrnaShield size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="sr-only">{a.roleAssistant}</p>
                <div className="rounded-2xl rounded-tl-sm border border-border/30 bg-surface/70 px-3.5 py-2.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {entry.content}
                  </p>
                </div>
                {entry.toolTrace?.length ? (
                  <ToolTraceCard traces={entry.toolTrace} />
                ) : null}
                {entry.pendingAction ? (
                  <ActionConfirmCard
                    action={entry.pendingAction}
                    onConfirmed={(msg) => handleConfirmed(entry.id, msg)}
                    onCancelled={() => handleCancelled(entry.id)}
                  />
                ) : null}
              </div>
            </div>
          ),
        )}

        {loading ? <ThinkingStatus label={a.thinking} /> : null}

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {trimmed ? (
        <p className="text-xs text-ink/50">{a.historyTrimmed}</p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-2 ${compact ? "shrink-0 border-t border-border/30 pt-3" : ""}`}
      >
        <label htmlFor={inputId} className="sr-only">
          {a.inputLabel}
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={a.inputPlaceholder}
          rows={compact ? 2 : 3}
          maxLength={4000}
          disabled={loading}
          className="bzr-input resize-y !rounded-xl disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!compact ? (
            <p className="max-w-md text-xs text-ink/50">{a.disclaimer}</p>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {!isEmpty ? (
              <button
                type="button"
                onClick={resetChat}
                disabled={loading}
                className="bzr-btn"
              >
                {a.newChat}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="bzr-btn bzr-btn-primary"
            >
              {loading ? a.sending : a.send}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
