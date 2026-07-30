import { saveRecord, getUnsyncedRecords, getRecords } from "@/lib/offline/indexedDB";
import type { FieldPhotoData, OfflineRecord } from "@/lib/offline/types";

/**
 * Sačuvaj fotografiju lokalno (uz binarni Blob u IndexedDB), povezanu sa
 * lokalnim id-jem terenske posete. Sinhronizuje se tek kada parent poseta
 * dobije server id (field_photos.field_visit_id je NOT NULL na serveru).
 */
export async function addFieldPhoto(input: {
  fieldVisitLocalId: string;
  file: File;
  ocrText?: string | null;
  ocrConfidence?: number | null;
}): Promise<OfflineRecord<FieldPhotoData>> {
  const now = Date.now();
  const id = crypto.randomUUID();

  const record: OfflineRecord<FieldPhotoData> = {
    id,
    table: "field_photos",
    data: {
      field_visit_local_id: input.fieldVisitLocalId,
      filename: input.file.name || "photo.jpg",
      mime_type: input.file.type || "image/jpeg",
      size_bytes: input.file.size,
      ocr_text: input.ocrText?.trim() ? input.ocrText.trim() : null,
      ocr_confidence: input.ocrConfidence ?? null,
      blob: input.file,
    },
    synced: false,
    createdAt: now,
    updatedAt: now,
  };

  await saveRecord("field_photos", record);
  return record;
}

export async function getPhotosForLocalVisit(
  fieldVisitLocalId: string,
): Promise<OfflineRecord<FieldPhotoData>[]> {
  const all = await getRecords<FieldPhotoData>("field_photos");
  return all.filter((p) => p.data.field_visit_local_id === fieldVisitLocalId);
}

export async function getUnsyncedPhotos(): Promise<
  OfflineRecord<FieldPhotoData>[]
> {
  return getUnsyncedRecords<FieldPhotoData>("field_photos");
}
