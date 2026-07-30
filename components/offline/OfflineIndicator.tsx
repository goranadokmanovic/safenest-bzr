"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useMounted } from "@/hooks/useMounted";

export function OfflineIndicator() {
  const { isOnline, isSyncing, pending, failedCount } = useOfflineSync();
  const mounted = useMounted();

  if (!mounted) {
    return null;
  }

  return (
    <div
      className="bzr-offline-indicator fixed right-3 top-auto bottom-3 z-50 flex items-center gap-2 rounded-full border border-border/15 bg-surface/90 px-3 py-1.5 text-xs font-medium shadow-card backdrop-blur lg:bottom-auto lg:top-3"
      role="status"
      aria-live="polite"
    >
      <span
        className={[
          "inline-block h-2.5 w-2.5 rounded-full",
          isOnline ? "bg-green-500" : "bg-red-500",
          isSyncing ? "animate-pulse" : "",
        ].join(" ")}
        aria-hidden
      />
      <span className="text-ink">
        {isOnline ? "Online" : "Offline"}
      </span>
      {isSyncing ? (
        <span className="text-ink/60">· sync…</span>
      ) : pending > 0 ? (
        <span className="text-ink/60">· {pending} čeka</span>
      ) : null}
      {!isSyncing && failedCount > 0 ? (
        <span className="text-red-700">· {failedCount} neuspeo</span>
      ) : null}
    </div>
  );
}