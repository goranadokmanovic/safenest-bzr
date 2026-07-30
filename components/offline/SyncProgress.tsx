"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useMounted } from "@/hooks/useMounted";
import { SyncFailedNotice } from "@/components/offline/SyncFailedNotice";

export function SyncProgress() {
  const { isSyncing, syncProgress, pending, lastError, failedCount } =
    useOfflineSync();
  const mounted = useMounted();

  if (!mounted) {
    return null;
  }

  if (!isSyncing && pending === 0 && !lastError && failedCount === 0) {
    return null;
  }

  const { uploaded, total } = syncProgress;
  const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;

  return (
    <div className="fixed bottom-3 right-3 z-50 w-72 space-y-2">
      <div className="rounded-md border border-ink/20 bg-surface p-3 text-xs shadow-md">
        {isSyncing || total > 0 ? (
          <>
            <div className="mb-1 flex justify-between text-ink">
              <span>Sinhronizacija</span>
              <span>
                {uploaded} / {total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : null}

        {!isSyncing && pending > 0 ? (
          <p className="mt-1 text-ink/70">{pending} zapis(a) čeka mrežu.</p>
        ) : null}

        {lastError ? (
          <p className="mt-2 text-red-700" role="alert">
            Greška: {lastError}
          </p>
        ) : null}
      </div>

      {failedCount > 0 ? <SyncFailedNotice /> : null}
    </div>
  );
}
