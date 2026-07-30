import {
  deleteRecord,
  getRecords,
  getUnsyncedRecords,
  saveRecord,
} from "@/lib/offline/indexedDB";
import type { FieldAudioData, OfflineRecord } from "@/lib/offline/types";

/** Čuva najviše jednu lokalnu glasovnu belešku po poseti. */
export async function addFieldAudio(input: {
  fieldVisitLocalId: string;
  blob: Blob;
  filename: string;
  durationSeconds: number;
  noiseMode: "quiet" | "noisy";
}): Promise<OfflineRecord<FieldAudioData>> {
  const existing = await getAudioForLocalVisit(input.fieldVisitLocalId);
  await Promise.all(
    existing.map((record) => deleteRecord("voice_recordings", record.id)),
  );

  const now = Date.now();
  const record: OfflineRecord<FieldAudioData> = {
    id: crypto.randomUUID(),
    table: "voice_recordings",
    data: {
      field_visit_local_id: input.fieldVisitLocalId,
      filename: input.filename,
      mime_type: input.blob.type || "audio/webm",
      size_bytes: input.blob.size,
      duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
      noise_mode: input.noiseMode,
      blob: input.blob,
    },
    synced: false,
    createdAt: now,
    updatedAt: now,
  };
  await saveRecord("voice_recordings", record);
  return record;
}

export async function getAudioForLocalVisit(
  fieldVisitLocalId: string,
): Promise<OfflineRecord<FieldAudioData>[]> {
  const all = await getRecords<FieldAudioData>("voice_recordings");
  return all.filter(
    (record) => record.data.field_visit_local_id === fieldVisitLocalId,
  );
}

export async function getUnsyncedAudio(): Promise<
  OfflineRecord<FieldAudioData>[]
> {
  return getUnsyncedRecords<FieldAudioData>("voice_recordings");
}
