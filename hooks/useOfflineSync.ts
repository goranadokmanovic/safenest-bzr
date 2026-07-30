"use client";

import { useCallback, useEffect, useState } from "react";
import {
  subscribe,
  getStatus,
  syncNow,
  addChange,
  discardFailedQueueItem,
} from "@/lib/offline/syncManager";
import type { SyncableTable } from "@/lib/offline/config";
import type { FailedSyncItem, SyncAction, SyncStatus } from "@/lib/offline/types";

export type UseOfflineSync = {
  isOnline: boolean;
  isSyncing: boolean;
  pending: number;
  failedCount: number;
  failedItems: FailedSyncItem[];
  syncProgress: { uploaded: number; total: number };
  lastSyncAt: number | null;
  lastError: string | null;
  syncData: () => Promise<void>;
  discardFailedQueueItem: (id: string) => Promise<void>;
  addToQueue: <T extends Record<string, unknown>>(
    table: SyncableTable,
    action: SyncAction,
    data: T,
    existingId?: string,
  ) => Promise<{ id: string }>;
};

export function useOfflineSync(): UseOfflineSync {
  const [status, setStatus] = useState<SyncStatus>(() => getStatus());

  useEffect(() => {
    const unsub = subscribe(setStatus);
    return () => {
      unsub();
    };
  }, []);

  const syncData = useCallback(async () => {
    await syncNow();
  }, []);

  const discardFailed = useCallback(async (id: string) => {
    await discardFailedQueueItem(id);
  }, []);

  const addToQueue = useCallback(
    async <T extends Record<string, unknown>>(
      table: SyncableTable,
      action: SyncAction,
      data: T,
      existingId?: string,
    ) => {
      const record = await addChange(table, action, data, existingId);
      return { id: record.id };
    },
    [],
  );

  return {
    isOnline: status.isOnline,
    isSyncing: status.isSyncing,
    pending: status.pending,
    failedCount: status.failedCount,
    failedItems: status.failedItems,
    syncProgress: { uploaded: status.uploaded, total: status.total },
    lastSyncAt: status.lastSyncAt,
    lastError: status.lastError,
    syncData,
    discardFailedQueueItem: discardFailed,
    addToQueue,
  };
}
