"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  expectedPhrase: string;
  description?: string;
  submitLabel?: string;
  danger?: boolean;
  onConfirm: (typedPhrase: string) => Promise<void>;
};

export function AdminPhraseModal({
  open,
  onClose,
  title,
  expectedPhrase,
  description,
  submitLabel,
  danger,
  onConfirm,
}: Props) {
  const { m } = useTranslations();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmLabel = submitLabel ?? m.common.confirm;

  useEffect(() => {
    if (open) {
      setInput("");
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await onConfirm(input.trim());
      setInput("");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : m.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-phrase-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-2 border-ink bg-surface p-6 shadow-xl">
        <h2 id="admin-phrase-modal-title" className="text-lg font-bold text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-ink/80">{description}</p>
        ) : null}
        <p className="mt-4 text-sm font-medium text-ink">
          {m.common.confirmPhraseLabel}
        </p>
        <code className="mt-2 block break-all rounded border border-ink/30 bg-ink/[0.06] p-2 text-xs text-ink">
          {expectedPhrase}
        </code>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="mt-4 w-full rounded-lg border border-border/40 px-3 py-2 text-sm text-ink"
          placeholder={m.common.confirmPhrasePlaceholder}
          autoComplete="off"
          aria-label={m.common.confirmPhraseHint}
        />
        {err ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {err}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className={
              danger
                ? "border border-red-800 bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                : "bzr-btn-primary"
            }
          >
            {busy ? m.common.loading : confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-border/40 bg-surface px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            {m.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
