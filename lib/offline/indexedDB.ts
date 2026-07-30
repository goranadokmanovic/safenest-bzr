import localforage from "localforage";
import {
  OFFLINE_DB_NAME,
  SYNCABLE_TABLES,
  REFERENCE_TABLES,
  INTERNAL_STORES,
  type SyncableTable,
  type ReferenceTable,
} from "@/lib/offline/config";
import type { OfflineRecord } from "@/lib/offline/types";

type StoreName =
  | SyncableTable
  | ReferenceTable
  | (typeof INTERNAL_STORES)[number];

const instances = new Map<StoreName, LocalForage>();
let initialized = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/** Lazy kreiranje localforage instance po store-u (svaki = zaseban objectStore). */
function store(name: StoreName): LocalForage {
  let inst = instances.get(name);
  if (!inst) {
    inst = localforage.createInstance({
      name: OFFLINE_DB_NAME,
      storeName: name.replace(/[^a-zA-Z0-9_]/g, "_"),
      driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
      description: `SafeNest offline store: ${name}`,
    });
    instances.set(name, inst);
  }
  return inst;
}

/** Inicijalizuje sve store-ove (poziva se na startup). */
export async function initOfflineDB(): Promise<void> {
  if (!isBrowser() || initialized) return;
  const all: StoreName[] = [
    ...SYNCABLE_TABLES,
    ...REFERENCE_TABLES,
    ...INTERNAL_STORES,
  ];
  await Promise.all(all.map((name) => store(name).ready()));
  initialized = true;
}

// -----------------------------------------------------------------------------
// CRUD nad syncable zapisima
// -----------------------------------------------------------------------------

export async function saveRecord<T extends Record<string, unknown>>(
  table: SyncableTable,
  record: OfflineRecord<T>,
): Promise<OfflineRecord<T>> {
  await store(table).setItem(record.id, record);
  return record;
}

export async function getRecord<T extends Record<string, unknown>>(
  table: SyncableTable,
  id: string,
): Promise<OfflineRecord<T> | null> {
  return (await store(table).getItem<OfflineRecord<T>>(id)) ?? null;
}

export async function getRecords<T extends Record<string, unknown>>(
  table: SyncableTable,
): Promise<OfflineRecord<T>[]> {
  const out: OfflineRecord<T>[] = [];
  await store(table).iterate<OfflineRecord<T>, void>((value) => {
    out.push(value);
  });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getUnsyncedRecords<T extends Record<string, unknown>>(
  table: SyncableTable,
): Promise<OfflineRecord<T>[]> {
  const all = await getRecords<T>(table);
  return all.filter((r) => !r.synced);
}

export async function deleteRecord(
  table: SyncableTable,
  id: string,
): Promise<void> {
  await store(table).removeItem(id);
}

export async function markSynced(
  table: SyncableTable,
  id: string,
  serverId?: string,
): Promise<void> {
  const existing = await getRecord(table, id);
  if (!existing) return;
  existing.synced = true;
  existing.serverId = serverId ?? existing.serverId;
  existing.updatedAt = Date.now();
  await store(table).setItem(id, existing);
}

// -----------------------------------------------------------------------------
// Referentne (read-only) tabele
// -----------------------------------------------------------------------------

export async function replaceReferenceData(
  table: ReferenceTable,
  rows: Array<{ id: string } & Record<string, unknown>>,
): Promise<void> {
  const s = store(table);
  await s.clear();
  await Promise.all(rows.map((row) => s.setItem(row.id, row)));
}

export async function getReferenceData<T = Record<string, unknown>>(
  table: ReferenceTable,
): Promise<T[]> {
  const out: T[] = [];
  await store(table).iterate<T, void>((value) => {
    out.push(value);
  });
  return out;
}

// -----------------------------------------------------------------------------
// Generički pristup internim store-ovima (sync queue, ocr, meta)
// -----------------------------------------------------------------------------

export function internalStore(
  name: (typeof INTERNAL_STORES)[number],
): LocalForage {
  return store(name);
}

export async function countAllUnsynced(): Promise<number> {
  const counts = await Promise.all(
    SYNCABLE_TABLES.map((t) => getUnsyncedRecords(t).then((r) => r.length)),
  );
  return counts.reduce((a, b) => a + b, 0);
}
