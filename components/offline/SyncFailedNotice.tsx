"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useMounted } from "@/hooks/useMounted";
import { useTranslations } from "@/components/i18n/locale-provider";

type Props = {
  /** Kompaktan prikaz bez liste stavki (npr. u header traci). */
  compact?: boolean;
  className?: string;
};

export function SyncFailedNotice({ compact = false, className = "" }: Props) {
  const { failedCount, failedItems, discardFailedQueueItem } =
    useOfflineSync();
  const { m } = useTranslations();
  const off = m.offline;
  const mounted = useMounted();

  if (!mounted || failedCount === 0) {
    return null;
  }

  const summary =
    failedCount === 1
      ? off.failedSyncOne
      : off.failedSyncMany.replace("{count}", String(failedCount));

  return (
    <div
      className={[
        "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900",
        className,
      ].join(" ")}
      role="alert"
    >
      <p>{summary}</p>
      {!compact ? (
        <ul className="mt-2 space-y-2 border-t border-red-200 pt-2">
          {failedItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                {item.table} · {item.recordId.slice(0, 8)}…
                {item.error ? (
                  <span className="text-red-800/80"> ({item.error})</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => void discardFailedQueueItem(item.id)}
                className="shrink-0 underline hover:text-red-950"
              >
                {off.removeFailed}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
