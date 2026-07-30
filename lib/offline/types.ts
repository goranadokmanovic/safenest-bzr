import type { SyncableTable } from "@/lib/offline/config";

export type SyncAction = "INSERT" | "UPDATE" | "DELETE";

/** Generički zapis u lokalnoj bazi. */
export type OfflineRecord<T = Record<string, unknown>> = {
  id: string;
  table: SyncableTable;
  data: T;
  synced: boolean;
  /** Server-side id nakon uspešnog sync-a (ako se razlikuje od lokalnog). */
  serverId?: string;
  createdAt: number;
  updatedAt: number;
};

/** Stavka u redu čekanja za sinhronizaciju. */
export type SyncQueueItem = {
  id: string;
  table: SyncableTable;
  action: SyncAction;
  recordId: string;
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
  error?: string;
};

export type OcrResult = {
  id: string;
  filename: string;
  text: string;
  createdAt: number;
};

/** Offline zapis fotografije (binarni sadržaj se čuva kao Blob u IndexedDB). */
export type FieldPhotoData = {
  /** Lokalni id terenske posete (parent) — koristi se da se sačeka server id. */
  field_visit_local_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
  blob: Blob;
};

/** Jedna offline glasovna beleška vezana za lokalnu terensku posetu. */
export type FieldAudioData = {
  field_visit_local_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number;
  noise_mode: "quiet" | "noisy";
  blob: Blob;
};

/** Rezultat sync-a po stavci (vraća ga /api/sync). */
export type SyncItemResult = {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  code?: string;
};

export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  /** Stavke koje syncNow() još pokušava (retries < max + nesinhronizovane fotografije). */
  pending: number;
  /** Stavke u redu sa retries >= max — više se ne pokušavaju automatski. */
  failedCount: number;
  failedItems: FailedSyncItem[];
  uploaded: number;
  total: number;
  lastSyncAt: number | null;
  lastError: string | null;
};

export type FailedSyncItem = {
  id: string;
  table: SyncableTable;
  recordId: string;
  error?: string;
};
