"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  ToolTraceCard,
  type ToolTrace,
} from "@/components/agencija/asistent/ToolTraceCard";

/** Mora da prati MAX_HISTORY_MESSAGES u app/api/assistant/chat/route.ts. */
const MAX_HISTORY_MESSAGES = 20;

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTrace[];
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssistantChat() {
  const { m } = useTranslations();
  const a = m.dashboard.assistant;

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, loading]);

  const send = useCallback(
    async (rawText: string) => {
      const question = rawText.trim();
      if (!question || loading) return;

      const userEntry: ChatEntry = {
        id: newId(),
        role: "user",
        content: question,
      };
      const nextEntries = [...entries, userEntry];

      setEntries(nextEntries);
      setInput("");
      setError(null);
      setLoading(true);

      // Server prihvata ograničen broj poruka; šaljemo najnovije.
      const payload = nextEntries
        .slice(-MAX_HISTORY_MESSAGES)
        .map((e) => ({ role: e.role, content: e.content }));

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
        });

        const json = (await res.json().catch(() => ({}))) as {
          reply?: string;
          toolTrace?: ToolTrace[];
          error?: string;
        };

        if (!res.ok || !json.reply) {
          setError(json.error ?? m.common.error);
          return;
        }

        setEntries((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: json.reply!,
            toolTrace: json.toolTrace ?? [],
          },
        ]);
      } catch {
        setError(m.common.networkError);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [entries, loading, m.common.error, m.common.networkError],
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
    setEntries([]);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  }

  const isEmpty = entries.length === 0;
  const trimmed = entries.length > MAX_HISTORY_MESSAGES;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div
        className="min-h-[18rem] space-y-5"
        role="log"
        aria-live="polite"
        aria-label={a.title}
      >
        {isEmpty ? (
          <div className="rounded-xl border border-border/40 bg-surface/60 p-5">
            <p className="font-semibold text-ink">{a.emptyTitle}</p>
            <p className="mt-1 text-sm text-ink/70">{a.emptyHint}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {a.suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void send(suggestion)}
                    disabled={loading}
                    className="rounded-full border border-border/50 bg-surface px-3 py-1.5 text-xs text-ink/80 transition hover:border-ink hover:text-ink disabled:opacity-60"
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
              <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-border/40 bg-surface px-4 py-2.5">
                <p className="sr-only">{a.roleYou}</p>
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {entry.content}
                </p>
              </div>
            </div>
          ) : (
            <div key={entry.id} className="max-w-[95%]">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink/45">
                {a.roleAssistant}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {entry.content}
              </p>
              {entry.toolTrace?.length ? (
                <ToolTraceCard traces={entry.toolTrace} />
              ) : null}
            </div>
          ),
        )}

        {loading ? (
          <p className="text-sm text-ink/60" role="status">
            {a.thinking}
          </p>
        ) : null}

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

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="assistant-input" className="sr-only">
          {a.inputLabel}
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={a.inputPlaceholder}
          rows={3}
          maxLength={4000}
          disabled={loading}
          className="w-full resize-y rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/50 disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-ink/50">{a.disclaimer}</p>
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
