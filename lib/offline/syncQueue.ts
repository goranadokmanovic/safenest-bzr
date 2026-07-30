import { internalStore } from "@/lib/offline/indexedDB";
import { MAX_SYNC_RETRIES, type SyncableTable } from "@/lib/offline/config";
import type { SyncAction, SyncQueueItem } from "@/lib/offline/types";

const QUEUE = "_sync_queue";

function queueKey(table: SyncableTable, recordId: string): string {
  return `${table}:${recordId}`;
}

/**
 * Dodaje (ili spaja) stavku u red. Dedupe po (table, recordId):
 * - više UPDATE-ova se spaja u jedan,
 * - INSERT + kasniji UPDATE ostaje INSERT sa najnovijim podacima,
 * - DELETE posle INSERT-a (još nije sync-ovan) uklanja stavku iz reda.
 */
export async function enqueue(
  action: SyncAction,
  table: SyncableTable,
  recordId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const store = internalStore(QUEUE);
  const key = queueKey(table, recordId);
  const existing = await store.getItem<SyncQueueItem>(key);

  if (existing) {
    if (existing.action === "INSERT" && action === "DELETE") {
      // Zapis nikad nije stigao na server — samo ukloni iz reda.
      await store.removeItem(key);
      return;
    }
    const mergedAction: SyncAction =
      existing.action === "INSERT" ? "INSERT" : action;
    const merged: SyncQueueItem = {
      ...existing,
      action: mergedAction,
      data: { ...existing.data, ...data },
      timestamp: Date.now(),
      retries: 0,
      error: undefined,
    };
    await store.setItem(key, merged);
    return;
  }

  const item: SyncQueueItem = {
    id: key,
    table,
    action,
    recordId,
    data,
    timestamp: Date.now(),
    retries: 0,
  };
  await store.setItem(key, item);
}

export async function getQueue(): Promise<SyncQueueItem[]> {
  const store = internalStore(QUEUE);
  const items: SyncQueueItem[] = [];
  await store.iterate<SyncQueueItem, void>((value) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

/** Stavke koje još smeju da se pokušaju (nisu prešle max retry). */
export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  const all = await getQueue();
  return all.filter((i) => i.retries < MAX_SYNC_RETRIES);
}

/** Stavke koje su potrošile sve pokušaje i više se ne šalju automatski. */
export async function getFailedQueue(): Promise<SyncQueueItem[]> {
  const all = await getQueue();
  return all.filter((i) => i.retries >= MAX_SYNC_RETRIES);
}

export async function countQueue(): Promise<number> {
  return (await getQueue()).length;
}

export async function removeFromQueue(id: string): Promise<void> {
  await internalStore(QUEUE).removeItem(id);
}

export async function markQueueError(
  id: string,
  error: string,
): Promise<void> {
  const store = internalStore(QUEUE);
  const existing = await store.getItem<SyncQueueItem>(id);
  if (!existing) return;
  existing.retries += 1;
  existing.error = error;
  await store.setItem(id, existing);
}

export async function clearQueue(): Promise<void> {
  await internalStore(QUEUE).clear();
}
