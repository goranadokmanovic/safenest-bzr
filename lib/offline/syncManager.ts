import {
  initOfflineDB,
  saveRecord,
  markSynced,
  getRecord,
} from "@/lib/offline/indexedDB";
import { getUnsyncedPhotos } from "@/lib/offline/photos";
import { getUnsyncedAudio } from "@/lib/offline/audio";
import {
  enqueue,
  getPendingQueue,
  getFailedQueue,
  getQueue,
  removeFromQueue,
  markQueueError,
} from "@/lib/offline/syncQueue";
import { replicateReferenceData } from "@/lib/offline/replication";
import {
  isOfflineEnabled,
  getSyncIntervalMs,
  backoffDelayMs,
  MAX_SYNC_RETRIES,
  type SyncableTable,
} from "@/lib/offline/config";
import type {
  OfflineRecord,
  SyncAction,
  SyncItemResult,
  SyncStatus,
} from "@/lib/offline/types";

type Listener = (status: SyncStatus) => void;

const status: SyncStatus = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSyncing: false,
  pending: 0,
  failedCount: 0,
  failedItems: [],
  uploaded: 0,
  total: 0,
  lastSyncAt: null,
  lastError: null,
};

const listeners = new Set<Listener>();
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  const snapshot = { ...status };
  listeners.forEach((l) => l(snapshot));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...status });
  return () => listeners.delete(listener);
}

export function getStatus(): SyncStatus {
  return { ...status };
}

async function refreshPending() {
  const [pendingQueue, failedQueue, photos, audio] = await Promise.all([
    getPendingQueue(),
    getFailedQueue(),
    getUnsyncedPhotos(),
    getUnsyncedAudio(),
  ]);
  status.pending = pendingQueue.length + photos.length + audio.length;
  status.failedCount = failedQueue.length;
  status.failedItems = failedQueue.map((i) => ({
    id: i.id,
    table: i.table,
    recordId: i.recordId,
    error: i.error,
  }));
  emit();
}

/** Uklanja mrtvu stavku iz sync reda (retries >= max). Lokalni zapis ostaje u IndexedDB. */
export async function discardFailedQueueItem(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  await initOfflineDB();
  await removeFromQueue(id);
  await refreshPending();
}

/** Inicijalizacija na startup (idempotentno). */
export async function initSyncManager(): Promise<void> {
  if (started || typeof window === "undefined" || !isOfflineEnabled()) return;
  started = true;

  await initOfflineDB();

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  status.isOnline = navigator.onLine;
  emit();

  // Inicijalna replikacija referentnih podataka (best-effort).
  if (navigator.onLine) {
    void replicateReferenceData();
  }

  await refreshPending();

  intervalId = setInterval(() => {
    if (status.isOnline && !status.isSyncing) {
      void syncNow();
    }
  }, getSyncIntervalMs());

  if (navigator.onLine) {
    void syncNow();
  }
}

export function stopSyncManager(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  if (intervalId) clearInterval(intervalId);
  if (backoffTimer) clearTimeout(backoffTimer);
  intervalId = null;
  backoffTimer = null;
  started = false;
}

function handleOnline() {
  status.isOnline = true;
  status.lastError = null;
  emit();
  void replicateReferenceData();
  void syncNow();
}

function handleOffline() {
  status.isOnline = false;
  emit();
}

/**
 * Lokalni upis + dodavanje u sync red. Vraća lokalni zapis.
 * Koristi se iz formi (npr. terenska poseta) za offline-first kreiranje.
 */
export async function addChange<T extends Record<string, unknown>>(
  table: SyncableTable,
  action: SyncAction,
  data: T,
  existingId?: string,
): Promise<OfflineRecord<T>> {
  await initOfflineDB();
  const now = Date.now();
  const id = existingId ?? crypto.randomUUID();

  const record: OfflineRecord<T> = {
    id,
    table,
    data,
    synced: false,
    createdAt: now,
    updatedAt: now,
  };

  if (action !== "DELETE") {
    await saveRecord(table, record);
  }
  await enqueue(action, table, id, { ...data, id });
  await refreshPending();

  // Ne pokreći sync ovde — pozivalac (npr. FieldVisitForm) prvo doda
  // fotografije/audio pa tek onda zove syncData(). Interval/online handler
  // i dalje pokrivaju ostale slučajeve.
  return record;
}

/**
 * Glavna sync rutina: šalje pending red na /api/sync, obrađuje rezultate.
 * Retry sa exponential backoff za neuspele stavke (do MAX_SYNC_RETRIES).
 *
 * Važno: isSyncing se postavlja SINHRONO pre prvog await-a — inače
 * addChange() (void syncNow) + eksplicitni syncData() mogu paralelno
 * poslati isti INSERT i kreirati duplikat field_visits na serveru.
 */
export async function syncNow(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  if (status.isSyncing) {
    return;
  }
  if (!navigator.onLine) {
    status.isOnline = false;
    emit();
    return;
  }

  status.isSyncing = true;
  status.lastError = null;
  emit();

  let hadFailure = false;
  let shouldRetryMedia = false;

  try {
    const pending = await getPendingQueue();
    const photos = await getUnsyncedPhotos();
    const audio = await getUnsyncedAudio();
    if (pending.length === 0 && photos.length === 0 && audio.length === 0) {
      await refreshPending();
      return;
    }

    status.total = pending.length + photos.length + audio.length;
    status.uploaded = 0;
    emit();

    // 1) JSON red (terenske posete, ocene rizika, poruke…) na /api/sync.
    if (pending.length > 0) {
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: pending.map((i) => ({
              id: i.id,
              table: i.table,
              action: i.action,
              recordId: i.recordId,
              data: i.data,
            })),
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Sync HTTP ${res.status}`);
        }

        const json = (await res.json()) as { results: SyncItemResult[] };

        for (const result of json.results) {
          const item = pending.find((p) => p.id === result.id);
          if (!item) continue;

          if (result.ok) {
            if (item.action !== "DELETE") {
              await markSynced(item.table, item.recordId, result.serverId);
            }
            await removeFromQueue(item.id);
            status.uploaded += 1;
            emit();
          } else {
            hadFailure = true;
            await markQueueError(item.id, result.error ?? "Nepoznata greška");
          }
        }
      } catch (e) {
        hadFailure = true;
        status.lastError = e instanceof Error ? e.message : "Greška pri sync-u";
      }
    }

    // 2) Fotografije (binarni upload) — posle poseta, da parent dobije server id.
    try {
      const photoResult = await syncPhotos();
      if (photoResult.failed > 0) hadFailure = true;
    } catch (e) {
      hadFailure = true;
      status.lastError =
        status.lastError ??
        (e instanceof Error ? e.message : "Greška pri sync-u slika");
    }

    // 3) Audio beleške — upload nakon parent posete, pa automatska transkripcija.
    try {
      const audioResult = await syncAudio();
      if (audioResult.failed > 0) hadFailure = true;
    } catch (e) {
      hadFailure = true;
      status.lastError =
        status.lastError ??
        (e instanceof Error ? e.message : "Greška pri sync-u audio beleške");
    }

    const remainingPhotos = await getUnsyncedPhotos();
    const remainingAudio = await getUnsyncedAudio();
    const remainingPending = await getPendingQueue();
    shouldRetryMedia =
      (remainingPhotos.length > 0 || remainingAudio.length > 0) &&
      remainingPending.length === 0 &&
      !hadFailure &&
      status.isOnline;
  } finally {
    status.lastSyncAt = Date.now();
    status.isSyncing = false;
    await refreshPending();
  }

  // Fotografije/audio dodati tokom sync-a posete — pokreni još jedan krug.
  if (shouldRetryMedia) {
    setTimeout(() => {
      if (!status.isSyncing) void syncNow();
    }, 50);
    return;
  }

  // Exponential backoff za preostale neuspele stavke.
  if (hadFailure) {
    const remaining = await getQueue();
    const retriable = remaining.filter((i) => i.retries < MAX_SYNC_RETRIES);
    const maxRetries =
      retriable.length > 0
        ? Math.max(...retriable.map((i) => i.retries))
        : 0;
    const delay = backoffDelayMs(maxRetries);
    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = setTimeout(() => {
      if (status.isOnline) void syncNow();
    }, delay);
  }
}

/**
 * Upload offline fotografija na /api/field-photos (multipart) sa Blob-om iz
 * IndexedDB. Fotografija se šalje tek kada njena terenska poseta dobije server
 * id (field_photos.field_visit_id je NOT NULL na serveru).
 */
async function syncPhotos(): Promise<{
  uploaded: number;
  failed: number;
  skipped: number;
}> {
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;

  const photos = await getUnsyncedPhotos();
  for (const photo of photos) {
    if (!navigator.onLine) {
      skipped += 1;
      continue;
    }

    const parent = await getRecord<Record<string, unknown>>(
      "field_visits",
      photo.data.field_visit_local_id,
    );
    const serverId = parent?.serverId;

    // Parent poseta još nije sinhronizovana — sačekaj sledeći krug.
    if (!parent || !parent.synced || !serverId) {
      skipped += 1;
      continue;
    }

    try {
      const file =
        photo.data.blob instanceof File
          ? photo.data.blob
          : new File([photo.data.blob], photo.data.filename, {
              type: photo.data.mime_type,
            });

      const form = new FormData();
      form.append("photo", file, photo.data.filename);
      form.append("field_visit_id", serverId);
      if (photo.data.ocr_text) {
        form.append("ocr_text", photo.data.ocr_text);
      }
      if (photo.data.ocr_confidence != null) {
        form.append("ocr_confidence", String(photo.data.ocr_confidence));
      }

      const res = await fetch("/api/field-photos", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        console.error(
          "[syncPhotos] upload failed",
          photo.id,
          res.status,
          body.error,
        );
        failed += 1;
        continue;
      }

      const json = (await res.json()) as { field_photo?: { id: string } };
      await markSynced("field_photos", photo.id, json.field_photo?.id);
      uploaded += 1;
      status.uploaded += 1;
      emit();
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed, skipped };
}

async function syncAudio(): Promise<{
  uploaded: number;
  failed: number;
  skipped: number;
}> {
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;

  const recordings = await getUnsyncedAudio();
  for (const recording of recordings) {
    if (!navigator.onLine) {
      skipped += 1;
      continue;
    }

    const parent = await getRecord<Record<string, unknown>>(
      "field_visits",
      recording.data.field_visit_local_id,
    );
    const serverId = parent?.serverId;
    if (!parent || !parent.synced || !serverId) {
      skipped += 1;
      continue;
    }

    try {
      const file =
        recording.data.blob instanceof File
          ? recording.data.blob
          : new File([recording.data.blob], recording.data.filename, {
              type: recording.data.mime_type,
            });
      const form = new FormData();
      form.append("audio", file, recording.data.filename);
      form.append("field_visit_id", serverId);
      form.append("noise_mode", recording.data.noise_mode);
      form.append("duration_seconds", String(recording.data.duration_seconds));

      const uploadResponse = await fetch("/api/field-audio", {
        method: "POST",
        body: form,
      });
      if (!uploadResponse.ok) {
        const body = (await uploadResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        console.error(
          "[syncAudio] upload failed",
          recording.id,
          uploadResponse.status,
          body.error,
        );
        failed += 1;
        continue;
      }

      // HTTP greška transkripcije je terminalno stanje koje je server već
      // upisao kao "failed"; upload se ipak smatra uspešno sinhronizovanim.
      const transcriptionResponse = await fetch(
        `/api/field-visits/${serverId}/transcribe`,
        { method: "POST" },
      );
      if (!transcriptionResponse.ok) {
        const body = (await transcriptionResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        console.error(
          "[syncAudio] transcription failed",
          recording.id,
          transcriptionResponse.status,
          body.error,
        );
      }

      await markSynced("voice_recordings", recording.id, serverId);
      uploaded += 1;
      status.uploaded += 1;
      emit();
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed, skipped };
}